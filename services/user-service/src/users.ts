import { Elysia, t } from "elysia";
import { audit } from "../../auth-service/src/audit";
import { publicUser, sql, type UserRow } from "../../auth-service/src/db";
import { authed } from "../../auth-service/src/guard";
import { ApiError, http, ok } from "../../auth-service/src/http";
import { hashPassword } from "../../auth-service/src/security";

const roleSchema = t.Union([t.Literal("platform_admin"), t.Literal("company_admin"), t.Literal("dispatcher"), t.Literal("driver")]);
const idSchema = t.String({ pattern: "^[1-9][0-9]{0,18}$" });
const companySchema = t.Optional(t.Union([idSchema, t.Null()]));
const nameSchema = t.String({ minLength: 1, maxLength: 150, pattern: "\\S" });
const emailSchema = t.String({ maxLength: 150, format: "email" });
const profileSchema = t.Object({
  full_name: nameSchema,
  email: t.Optional(emailSchema),
  phone: t.Optional(t.Union([t.String({ maxLength: 30 }), t.Null()])),
});
const USER_COLS = sql`user_id, company_id, full_name, email, role, phone, account_status`;
type Actor = Pick<UserRow, "user_id" | "role" | "company_id">;

function validId(id: string) {
  if (BigInt(id) > 9223372036854775807n) throw new ApiError(422, "VALIDATION_ERROR", "ID exceeds PostgreSQL BIGINT range");
  return id;
}

function scope(me: Actor, companyId?: string) {
  if (companyId) validId(companyId);
  if (me.role === "platform_admin") return companyId ? sql`company_id = ${companyId}` : sql`TRUE`;
  if (companyId && companyId !== me.company_id) throw new ApiError(403, "FORBIDDEN", "Cannot access another workspace");
  return sql`company_id = ${me.company_id}`;
}

async function target(db: typeof sql, me: Actor, id: string) {
  const [row] = await db`SELECT ${USER_COLS} FROM users WHERE user_id = ${validId(id)} AND ${scope(me)} FOR UPDATE`;
  if (!row) throw new ApiError(404, "NOT_FOUND", "User not found");
  return row;
}

async function companyForRole(db: typeof sql, me: Actor, role: UserRow["role"], requested: string | null | undefined, existing?: string | null) {
  if (me.role !== "platform_admin") {
    if (role === "platform_admin" || (requested !== undefined && requested !== me.company_id)) {
      throw new ApiError(403, "FORBIDDEN", "Cannot grant platform privileges or change workspace");
    }
    return me.company_id;
  }
  const companyId = requested === undefined ? (role === "platform_admin" ? null : existing) : requested;
  if (role === "platform_admin") {
    if (companyId != null) throw new ApiError(422, "VALIDATION_ERROR", "Platform Admin must have a null company_id");
    return null;
  }
  if (!companyId) throw new ApiError(422, "VALIDATION_ERROR", "Company roles require company_id");
  if (existing && existing !== companyId) throw new ApiError(422, "VALIDATION_ERROR", "Changing a user's existing workspace is not supported");
  const [company] = await db`SELECT company_id FROM company WHERE company_id = ${validId(companyId)}`;
  if (!company) throw new ApiError(422, "VALIDATION_ERROR", "Company does not exist");
  return companyId;
}

const meRoutes = new Elysia().use(http).use(authed())
  .get("/me", ({ me }) => ok(publicUser(me)))
  .put("/me", async ({ me, body, ip }) => {
    const row = await sql.begin(async tx => {
      const [old] = await tx`SELECT ${USER_COLS} FROM users WHERE user_id = ${me.user_id} FOR UPDATE`;
      const [updated] = await tx`
        UPDATE users SET full_name = ${body.full_name.trim()}, email = ${body.email?.toLowerCase() ?? old.email},
          phone = ${body.phone === undefined ? old.phone : body.phone?.trim() || null}, updated_at = now()
        WHERE user_id = ${me.user_id} RETURNING ${USER_COLS}`;
      await audit({ companyId: old.company_id, userId: me.user_id, action: "user.update_self", entityType: "user", entityId: me.user_id,
        oldValue: publicUser(old), newValue: publicUser(updated), ip }, tx);
      return updated;
    });
    return ok(publicUser(row), "Profile updated");
  }, { body: profileSchema });

const adminRoutes = new Elysia().use(http).use(authed("company_admin", "platform_admin"))
  .get("/", async ({ me, query }) => {
    const rows = await sql`SELECT ${USER_COLS} FROM users WHERE ${scope(me, query.company_id)}
      ORDER BY user_id LIMIT ${query.limit ?? 50} OFFSET ${query.offset ?? 0}`;
    return ok(rows.map(publicUser));
  }, { query: t.Object({
    company_id: t.Optional(idSchema), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
    offset: t.Optional(t.Numeric({ minimum: 0, maximum: 2147483647, multipleOf: 1 })),
  }) })
  .get("/:id", async ({ me, params }) => {
    const [row] = await sql`SELECT ${USER_COLS} FROM users WHERE user_id = ${validId(params.id)} AND ${scope(me)}`;
    if (!row) throw new ApiError(404, "NOT_FOUND", "User not found");
    return ok(publicUser(row));
  }, { params: t.Object({ id: idSchema }) })
  .post("/", async ({ me, body, ip, set }) => {
    const passwordHash = await hashPassword(body.password);
    const row = await sql.begin(async tx => {
      const companyId = await companyForRole(tx, me, body.role, body.company_id);
      const [created] = await tx`INSERT INTO users (company_id, full_name, email, password_hash, role, phone)
        VALUES (${companyId}, ${body.full_name.trim()}, ${body.email.toLowerCase()}, ${passwordHash}, ${body.role}, ${body.phone?.trim() || null})
        RETURNING ${USER_COLS}`;
      await audit({ companyId, userId: me.user_id, action: "user.create", entityType: "user", entityId: created.user_id, newValue: publicUser(created), ip }, tx);
      return created;
    });
    set.status = 201;
    return ok(publicUser(row), "User created");
  }, { body: t.Object({ full_name: nameSchema, email: emailSchema, password: t.String({ minLength: 10, maxLength: 128 }),
    role: roleSchema, company_id: companySchema, phone: t.Optional(t.Union([t.String({ maxLength: 30 }), t.Null()])) }) })
  .put("/:id", async ({ me, params, body, ip }) => {
    const row = await sql.begin(async tx => {
      const old = await target(tx, me, params.id);
      const [updated] = await tx`UPDATE users SET full_name = ${body.full_name.trim()}, email = ${body.email?.toLowerCase() ?? old.email},
        phone = ${body.phone === undefined ? old.phone : body.phone?.trim() || null}, updated_at = now()
        WHERE user_id = ${old.user_id} RETURNING ${USER_COLS}`;
      await audit({ companyId: old.company_id, userId: me.user_id, action: "user.update", entityType: "user", entityId: old.user_id,
        oldValue: publicUser(old), newValue: publicUser(updated), ip }, tx);
      return updated;
    });
    return ok(publicUser(row), "User updated");
  }, { params: t.Object({ id: idSchema }), body: profileSchema })
  .patch("/:id/role", async ({ me, params, body, ip }) => {
    if (params.id === me.user_id) throw new ApiError(409, "CONFLICT", "You cannot change your own role");
    const row = await sql.begin(async tx => {
      const old = await target(tx, me, params.id);
      const companyId = await companyForRole(tx, me, body.role, body.company_id, old.company_id);
      const [updated] = await tx`UPDATE users SET role = ${body.role}, company_id = ${companyId}, updated_at = now()
        WHERE user_id = ${old.user_id} RETURNING ${USER_COLS}`;
      await audit({ companyId: old.company_id ?? companyId, userId: me.user_id, action: "user.change_role", entityType: "user", entityId: old.user_id,
        oldValue: { role: old.role, company_id: old.company_id }, newValue: { role: updated.role, company_id: companyId }, ip }, tx);
      return updated;
    });
    return ok(publicUser(row), "Role updated");
  }, { params: t.Object({ id: idSchema }), body: t.Object({ role: roleSchema, company_id: companySchema }) })
  .patch("/:id/status", async ({ me, params, body, ip }) => {
    if (params.id === me.user_id) throw new ApiError(409, "CONFLICT", "You cannot change your own status");
    const row = await sql.begin(async tx => {
      const old = await target(tx, me, params.id);
      const [updated] = await tx`UPDATE users SET account_status = ${body.account_status}, updated_at = now()
        WHERE user_id = ${old.user_id} RETURNING ${USER_COLS}`;
      if (body.account_status !== "active") await tx`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${old.user_id} AND revoked_at IS NULL`;
      await audit({ companyId: old.company_id, userId: me.user_id, action: "user.change_status", entityType: "user", entityId: old.user_id,
        oldValue: { account_status: old.account_status }, newValue: { account_status: updated.account_status }, ip }, tx);
      return updated;
    });
    return ok(publicUser(row), "Status updated");
  }, { params: t.Object({ id: idSchema }), body: t.Object({ account_status: t.Union([t.Literal("active"), t.Literal("inactive"), t.Literal("suspended")]) }) });

export const userRoutes = new Elysia({ prefix: "/api/v1/users" }).use(meRoutes).use(adminRoutes);
