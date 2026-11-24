import { ApiError, parseId, sum, zeroFilled, type Caller } from "@vayro/service-kit";
import { userAdmins, type AdminDirectory } from "../../adapters/user-service";
import { audit } from "../../lib/audit";
import { prisma } from "../../lib/prisma";
import * as companies from "./companies.repository";
import { publicCompany, type WorkspaceStatus } from "./companies.model";

export interface RegisterInput {
  company_name: string;
  contact_name?: string;
  contact_email: string;
  contact_phone?: string;
  admin_full_name: string;
  admin_email: string;
  admin_password: string;
}

// Public self-registration. Creates a workspace in 'pending' state plus its first Company Admin.
// The admin cannot sign in until a Platform Admin sets workspace_status to 'active'.
//
// The two records live in different services, so they are not one transaction, and "no answer" does not mean "not done":
// user-service may have created the admin and the reply got lost. So a failed create is never trusted by itself. Before
// anything is undone the admin is looked up:
//   exists   -> it was created after all: carry on, keep the company
//   missing  -> really not created: delete the company again and report the original error (the client may retry)
//   unknown  -> cannot tell: keep the company (deleting it could orphan an admin) and report 503
export async function register(body: RegisterInput, ip: string | null, admins: AdminDirectory = userAdmins) {
  const company = await companies.create(prisma, {
    company_name: body.company_name.trim(),
    contact_name: body.contact_name ?? null,
    contact_email: body.contact_email.trim().toLowerCase(),
    contact_phone: body.contact_phone ?? null,
  });
  const companyId = String(company.company_id);
  const adminEmail = body.admin_email.trim().toLowerCase();
  try {
    await admins.create({ company_id: companyId, full_name: body.admin_full_name.trim(), email: adminEmail, password: body.admin_password });
  } catch (err) {
    const state = await admins.exists(companyId, adminEmail).then((found) => (found ? "exists" : "missing"), () => "unknown");
    if (state === "missing") {
      await companies.remove(prisma, company.company_id).catch((e) => console.error(`could not undo registration of company ${companyId}:`, e instanceof Error ? e.message : "unknown error"));
      throw err;
    }
    if (state === "unknown") {
      console.error(`registration of company ${companyId} could not be confirmed (user-service unreachable); company kept as pending`);
      throw new ApiError(503, "REGISTRATION_UNCONFIRMED", "Registration could not be confirmed. Please contact support before trying again.");
    }
  }
  await audit({ companyId: company.company_id, action: "company.register", entityType: "company", entityId: company.company_id, ip });
  return { ...company, company_id: companyId };
}

// Platform-wide count of workspaces by status (for the platform dashboard).
export async function stats() {
  const by_status = zeroFilled(["pending", "active", "suspended", "rejected"], (await companies.countByStatus(prisma)).map((r) => [r.workspace_status, r._count._all] as const));
  return { total: sum(by_status), by_status };
}

export async function getWorkspace(id: bigint) {
  const company = await companies.findById(prisma, id);
  return company && { company_id: String(company.company_id), company_name: company.company_name, workspace_status: company.workspace_status };
}

// ---------------------------------------------------------------- Platform Admin: read, edit, approve, reject, suspend

export async function list(q: { q?: string; status?: WorkspaceStatus; page?: number; limit?: number }) {
  const page = q.page ?? 1, limit = q.limit ?? 20;
  // Prisma's `contains` does not escape LIKE wildcards, so "%" and "_" typed by the user are escaped here (PostgreSQL's default escape is "\").
  const text = q.q?.trim().replace(/[\\%_]/g, "\\$&");
  const where = {
    ...(q.status ? { workspace_status: q.status } : {}),
    // search in the name and the contact
    ...(text ? { OR: [{ company_name: { contains: text, mode: "insensitive" as const } }, { contact_name: { contains: text, mode: "insensitive" as const } }, { contact_email: { contains: text, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total] = await companies.list(prisma, where, limit, (page - 1) * limit);
  return { rows: rows.map(publicCompany), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function get(id: string) {
  const company = await companies.findFull(prisma, parseId(id));
  if (!company) throw new ApiError(404, "NOT_FOUND", "Company not found");
  return publicCompany(company);
}

interface EditInput { company_name?: string; contact_name?: string | null; contact_email?: string; contact_phone?: string | null }

// Edits name and contact details. Fields left out stay as they are; null clears an optional one. The e-mail stays unique.
export async function update(me: Caller, id: string, body: EditInput, ip: string | null) {
  const companyId = parseId(id);
  const result = await prisma.$transaction(async (tx) => {
    await companies.lock(tx, companyId);
    const old = await companies.findFull(tx, companyId);
    if (!old) throw new ApiError(404, "NOT_FOUND", "Company not found");
    const data = {
      ...(body.company_name !== undefined ? { company_name: body.company_name.trim() } : {}),
      ...(body.contact_name !== undefined ? { contact_name: body.contact_name?.trim() || null } : {}),
      ...(body.contact_email !== undefined ? { contact_email: body.contact_email.trim().toLowerCase() } : {}),
      ...(body.contact_phone !== undefined ? { contact_phone: body.contact_phone?.trim() || null } : {}),
    };
    const updated = await companies.update(tx, companyId, data);
    const fields = Object.keys(data) as (keyof typeof data)[];
    await audit({ companyId, userId: me.user_id, action: "company.update", entityType: "company", entityId: companyId, ip,
      oldValue: Object.fromEntries(fields.map((f) => [f, old[f]])), newValue: Object.fromEntries(fields.map((f) => [f, updated[f]])) }, tx);
    return updated;
  });
  return publicCompany(result);
}

interface Step { to: WorkspaceStatus; action: string; detail?: { reason: string } }

// One status change: lock the row, check that the change is allowed from the CURRENT status, change it and write the
// audit row in the same transaction (if the log cannot be written, the change is undone). `plan` returns null when the
// workspace is already in the wanted state: nothing changes and nothing is logged.
async function transition(me: Caller, id: string, ip: string | null, plan: (current: WorkspaceStatus) => Step | null) {
  const companyId = parseId(id);
  const result = await prisma.$transaction(async (tx) => {
    await companies.lock(tx, companyId);
    const old = await companies.findFull(tx, companyId);
    if (!old) throw new ApiError(404, "NOT_FOUND", "Company not found");
    const step = plan(old.workspace_status);
    if (!step) return old;
    const updated = await companies.update(tx, companyId, { workspace_status: step.to });
    await audit({ companyId, userId: me.user_id, action: step.action, entityType: "company", entityId: companyId, ip,
      oldValue: { workspace_status: old.workspace_status }, newValue: { workspace_status: step.to, ...step.detail } }, tx);
    return updated;
  });
  return publicCompany(result);
}

const notAllowed = (message: string) => new ApiError(409, "INVALID_STATE", message);

// A request is approved or rejected once, while it is pending.
export const approve = (me: Caller, id: string, ip: string | null) =>
  transition(me, id, ip, (current) => {
    if (current !== "pending") throw notAllowed(`Only a pending request can be approved (this workspace is ${current})`);
    return { to: "active", action: "company.approve" };
  });

export const reject = (me: Caller, id: string, reason: string | undefined, ip: string | null) =>
  transition(me, id, ip, (current) => {
    if (current !== "pending") throw notAllowed(`Only a pending request can be rejected (this workspace is ${current})`);
    return { to: "rejected", action: "company.reject", detail: reason ? { reason } : undefined };
  });

// Suspend an active workspace or re-open a suspended one. Pending and rejected ones are only changed by approve / reject.
export const setStatus = (me: Caller, id: string, target: "active" | "suspended", ip: string | null) =>
  transition(me, id, ip, (current) => {
    if (current === target) return null;
    if (current === "active" && target === "suspended") return { to: "suspended", action: "company.suspend" };
    if (current === "suspended" && target === "active") return { to: "active", action: "company.activate" };
    throw notAllowed(`A ${current} workspace is changed with approve or reject, not with status`);
  });
