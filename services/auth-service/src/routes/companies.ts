import { Elysia, t } from "elysia";
import { audit } from "../audit";
import { sql } from "../db";
import { http, ok } from "../http";
import { hashPassword } from "../security";

// Public self-registration. Creates a workspace in 'pending' state plus its first Company Admin.
// The admin cannot sign in until a Platform Admin sets workspace_status to 'active'.
export const companyRoutes = new Elysia({ prefix: "/api/v1/companies" }).use(http).post(
  "/register",
  async ({ body, ip }) => {
    const adminEmail = body.admin_email.trim().toLowerCase();
    const passwordHash = await hashPassword(body.admin_password);

    const company = await sql.begin(async (tx) => {
      const [c] = await tx`
        INSERT INTO company (company_name, contact_name, contact_email, contact_phone)
        VALUES (${body.company_name.trim()}, ${body.contact_name ?? null}, ${body.contact_email.trim().toLowerCase()}, ${body.contact_phone ?? null})
        RETURNING company_id, company_name, workspace_status`;
      await tx`
        INSERT INTO users (company_id, full_name, email, password_hash, role)
        VALUES (${c.company_id}, ${body.admin_full_name.trim()}, ${adminEmail}, ${passwordHash}, 'company_admin')`;
      return c;
    });

    await audit({ companyId: company.company_id, action: "company.register", entityType: "company", entityId: company.company_id, ip });
    return ok(company, "Registration received. Sign-in is available once the workspace is approved.");
  },
  {
    body: t.Object({
      company_name: t.String({ minLength: 1, maxLength: 150 }),
      contact_name: t.Optional(t.String({ maxLength: 150 })),
      contact_email: t.String({ minLength: 3, maxLength: 150, format: "email" }),
      contact_phone: t.Optional(t.String({ maxLength: 30 })),
      admin_full_name: t.String({ minLength: 1, maxLength: 150 }),
      admin_email: t.String({ minLength: 3, maxLength: 150, format: "email" }),
      admin_password: t.String({ minLength: 10, maxLength: 128 }),
    }),
  },
);
