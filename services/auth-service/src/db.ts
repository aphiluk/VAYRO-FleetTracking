import { SQL } from "bun";
import { config } from "./config";

export const sql = new SQL(config.databaseUrl);

// BIGINT ids come back from Postgres as strings; keep them as strings end to end.
export type Role = "platform_admin" | "company_admin" | "dispatcher" | "driver";
export type AccountStatus = "active" | "inactive" | "suspended";

export interface UserRow {
  user_id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  phone: string | null;
  account_status: AccountStatus;
  workspace_status: string | null;
}

// Never selects password_hash; safe to return to clients.
export function publicUser(u: Omit<UserRow, "password_hash" | "workspace_status">) {
  return {
    user_id: u.user_id,
    company_id: u.company_id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    account_status: u.account_status,
  };
}
