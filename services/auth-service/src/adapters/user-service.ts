import { ApiError, internalClient } from "@vayro/service-kit";
import { config } from "../config/env";

const users = internalClient(config.userServiceUrl, config.internalToken);
const companies = internalClient(config.companyServiceUrl, config.internalToken);

// A user as user-service reports it, joined with their workspace status from company-service.
// Never carries a password hash.
export interface SessionUser {
  user_id: string;
  company_id: string | null;
  company_name: string | null;
  full_name: string;
  email: string;
  role: "platform_admin" | "company_admin" | "dispatcher" | "driver";
  phone: string | null;
  account_status: "active" | "inactive" | "suspended";
  workspace_status: string | null;
}
type PublicUser = Omit<SessionUser, "workspace_status" | "company_name">;

const unexpected = (service: string, status: number) => new ApiError(502, "UPSTREAM_ERROR", `${service} returned ${status}`);

// null for Platform Admins (no company) and for a company that does not exist: both are "not usable" for company roles.
async function workspace(companyId: string | null): Promise<Pick<SessionUser, "workspace_status" | "company_name">> {
  const unavailable = { workspace_status: null, company_name: null };
  if (companyId === null) return unavailable;
  const { status, body } = await companies("GET", `/internal/companies/${companyId}`);
  if (status === 404) return unavailable;
  if (status !== 200) throw unexpected("company-service", status);
  return { workspace_status: body.data.workspace_status, company_name: typeof body.data.company_name === "string" ? body.data.company_name.trim() || null : null };
}

const withWorkspace = async (user: PublicUser): Promise<SessionUser> => ({ ...user, ...await workspace(user.company_id) });

// `user` is set whenever the email exists, even when the password is wrong (needed for the audit trail).
export async function verifyCredentials(email: string, password: string): Promise<{ valid: boolean; user: SessionUser | null }> {
  const { status, body } = await users("POST", "/internal/credentials/verify", { body: { email, password } });
  if (status !== 200 || !body?.data) throw unexpected("user-service", status);
  return { valid: body.data.valid, user: body.data.user ? await withWorkspace(body.data.user) : null };
}

export async function findUser(id: string): Promise<SessionUser | null> {
  const { status, body } = await users("GET", `/internal/users/${id}`);
  if (status === 404) return null;
  if (status !== 200 || !body?.data) throw unexpected("user-service", status);
  return withWorkspace(body.data);
}
