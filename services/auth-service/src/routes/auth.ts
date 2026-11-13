import { Elysia, t } from "elysia";
import { audit } from "../audit";
import { config } from "../config";
import { publicUser, sql, type UserRow } from "../db";
import { authed, canUseSystem, denyReason } from "../guard";
import { ApiError, http, ok } from "../http";
import {
  DUMMY_HASH,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
  verifyPassword,
} from "../security";

async function issueSession(user: Pick<UserRow, "user_id" | "role" | "company_id">, ip: string | null, ua: string | null, db = sql) {
  const refresh = newRefreshToken();
  const [session] = await db`
    INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at, ip_address, user_agent)
    VALUES (${user.user_id}, ${hashRefreshToken(refresh)}, ${new Date(Date.now() + config.refreshTtlSeconds * 1000)}, ${ip}, ${ua})
    RETURNING session_id`;
  return {
    access_token: signAccessToken({ sub: user.user_id, role: user.role, cid: user.company_id, sid: session.session_id }),
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: config.accessTtlSeconds,
  };
}

const refreshBody = t.Object({ refresh_token: t.String({ minLength: 1, maxLength: 200 }) });

export const authRoutes = new Elysia({ prefix: "/api/v1/auth" })
  .use(http)
  .post(
    "/login",
    async ({ body, ip, userAgent }) => {
      const email = body.email.trim().toLowerCase();
      const [user] = await sql`
        SELECT u.user_id, u.company_id, u.full_name, u.email, u.password_hash, u.role, u.phone, u.account_status, c.workspace_status
        FROM users u LEFT JOIN company c ON c.company_id = u.company_id
        WHERE u.email = ${email}`;

      // verify even for unknown emails so response time does not reveal which emails exist
      const valid = await verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !valid) {
        await audit({ companyId: user?.company_id, userId: user?.user_id, action: "auth.login", result: "failure", ip });
        throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
      }
      if (!canUseSystem(user)) {
        await audit({ companyId: user.company_id, userId: user.user_id, action: "auth.login", result: "failure", ip });
        throw denyReason(user);
      }

      const tokens = await issueSession(user, ip, userAgent);
      await audit({ companyId: user.company_id, userId: user.user_id, action: "auth.login", ip });
      return ok({ ...tokens, user: publicUser(user) }, "Login successful");
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 150 }),
        password: t.String({ minLength: 1, maxLength: 128 }), // cap bounds argon2 work per request
      }),
    },
  )
  .post(
    "/refresh",
    async ({ body, ip, userAgent }) => {
      const hash = hashRefreshToken(body.refresh_token);
      // Lock the user's row to serialize rotations across all their sessions, including replay revocation.
      const result = await sql.begin(async (tx) => {
        const [owner] = await tx`
          SELECT u.user_id, u.role, u.company_id, u.account_status, c.workspace_status
          FROM users u LEFT JOIN company c ON c.company_id = u.company_id
          WHERE u.user_id = (SELECT user_id FROM auth_sessions WHERE refresh_token_hash = ${hash})
          FOR UPDATE OF u`;
        if (!owner) return null;
        const [session] = await tx`
          SELECT session_id, revoked_at, expires_at > now() AS valid
          FROM auth_sessions WHERE refresh_token_hash = ${hash}`;
        if (session.revoked_at || !canUseSystem(owner)) {
          await tx`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${owner.user_id} AND revoked_at IS NULL`;
          return { reused: !!session.revoked_at, userId: owner.user_id };
        }
        if (!session.valid) return null;
        await tx`UPDATE auth_sessions SET revoked_at = now(), last_used_at = now() WHERE session_id = ${session.session_id}`;
        return { tokens: await issueSession(owner, ip, userAgent, tx) };
      });
      if (!result || !("tokens" in result)) {
        if (result?.reused) await audit({ userId: result.userId, action: "auth.refresh_reuse", result: "failure", ip });
        throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");
      }
      return ok(result.tokens, "Token refreshed");
    },
    { body: refreshBody },
  )
  .post(
    "/logout",
    async ({ body, ip }) => {
      // idempotent; the refresh token itself is the credential, so no bearer token is needed
      const [row] = await sql`
        UPDATE auth_sessions SET revoked_at = now()
        WHERE refresh_token_hash = ${hashRefreshToken(body.refresh_token)} AND revoked_at IS NULL
        RETURNING user_id`;
      if (row) await audit({ userId: row.user_id, action: "auth.logout", ip });
      return ok(null, "Logged out");
    },
    { body: refreshBody },
  )
  .use(authed())
  .get("/me", ({ me }) => ok({ ...publicUser(me), workspace_status: me.workspace_status }));
