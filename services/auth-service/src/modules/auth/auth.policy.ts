import { ApiError } from "@vayro/service-kit";
import type { SessionUser } from "../../adapters/user-service";

type Status = Pick<SessionUser, "role" | "account_status" | "company_id" | "workspace_status">;

// Can this user sign in / use a token right now? Platform admins have no company workspace.
export const canUseSystem = (u: Status) =>
  u.account_status === "active" && (u.role === "platform_admin" ? u.company_id === null : u.company_id !== null && u.workspace_status === "active");

export function denyReason(u: Pick<SessionUser, "account_status">) {
  return u.account_status !== "active"
    ? new ApiError(403, "ACCOUNT_INACTIVE", "This account is not active")
    : new ApiError(403, "WORKSPACE_NOT_ACTIVE", "This company workspace is not active");
}

// Never carries workspace_status or anything secret; safe to return to clients.
export const publicUser = (u: SessionUser) => ({
  user_id: u.user_id,
  company_id: u.company_id,
  company_name: u.company_name,
  full_name: u.full_name,
  email: u.email,
  role: u.role,
  phone: u.phone,
  account_status: u.account_status,
});
