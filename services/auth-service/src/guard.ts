import { Elysia } from "elysia";
import { sql, type Role, type UserRow } from "./db";
import { ApiError } from "./http";
import { verifyAccessToken } from "./security";

type Me = Omit<UserRow, "password_hash">;

// Can this user sign in / use a token right now? Platform admins have no company workspace.
export const canUseSystem = (u: Pick<UserRow, "role" | "account_status" | "company_id" | "workspace_status">) =>
  u.account_status === "active" && (u.role === "platform_admin"
    ? u.company_id === null
    : u.company_id !== null && u.workspace_status === "active");

export function denyReason(u: Pick<UserRow, "account_status" | "workspace_status">) {
  return u.account_status !== "active"
    ? new ApiError(403, "ACCOUNT_INACTIVE", "This account is not active")
    : new ApiError(403, "WORKSPACE_NOT_ACTIVE", "This company workspace is not active");
}

export async function findUserById(id: string): Promise<Me | undefined> {
  const [row] = await sql`
    SELECT u.user_id, u.company_id, u.full_name, u.email, u.role, u.phone, u.account_status, c.workspace_status
    FROM users u LEFT JOIN company c ON c.company_id = u.company_id
    WHERE u.user_id = ${id}`;
  return row;
}

// Requires a valid bearer token, then re-reads the user so role/status changes apply immediately
// (suspending a user or workspace takes effect without waiting for the access token to expire).
// Provides `me`. Pass roles to restrict access.
export const authed = (...roles: Role[]) =>
  new Elysia().resolve({ as: "scoped" }, async ({ headers }) => {
    const token = headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    const claims = token ? verifyAccessToken(token) : null;
    if (!claims || !/^\d+$/.test(claims.sub)) throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid access token");

    const me = await findUserById(claims.sub);
    if (!me) throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid access token");
    if (!canUseSystem(me)) throw denyReason(me);
    const [session] = await sql`
      SELECT session_id FROM auth_sessions
      WHERE session_id = ${claims.sid} AND user_id = ${me.user_id}
        AND revoked_at IS NULL AND expires_at > now()`;
    if (!session) throw new ApiError(401, "UNAUTHORIZED", "Session expired or revoked");
    if (roles.length && !roles.includes(me.role)) throw new ApiError(403, "FORBIDDEN", "Insufficient role");
    return { me };
  });
