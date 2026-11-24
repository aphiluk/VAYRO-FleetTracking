import { ApiError, companyScope, parseId, requireRole, type Caller } from "@vayro/service-kit";
import type { CreateTransportJobRequest, TransportJobRecord, TransportJobStatus, UpdateTransportJobRequest } from "../../../../../packages/shared-types";
import type { Directories } from "../../adapters/directories";
import { pauseOfflineCheck, raiseAlert } from "../../adapters/alert-service";
import { audit } from "../../lib/audit";
import { prisma, Prisma, type Db } from "../../lib/prisma";
import { cleanText, invalid, optionalText, parseDate, toJob, validateRoute, type JobRow } from "./jobs.model";
import * as repository from "./jobs.repository";

export interface JobContext { me: Caller; directories: Directories; ip: string | null }
interface Query { company_id?: string; q?: string; job_status?: TransportJobStatus; limit?: number; offset?: number }
const manager = (me: Caller) => requireRole(me, "platform_admin", "company_admin", "dispatcher");
function conflict(message: string): never { throw new ApiError(409, "CONFLICT", message); }
function scope(me: Caller, requested?: string): Prisma.TransportJobWhereInput {
  return { ...companyScope(me, requested), ...(me.role === "driver" ? { driver_id: parseId(me.user_id) } : {}) };
}
async function enrich(rows: JobRow[], directories: Directories): Promise<TransportJobRecord[]> {
  const users = new Map<string, ReturnType<Directories["findUser"]>>();
  const vehicles = new Map<string, ReturnType<Directories["findVehicle"]>>();
  return Promise.all(rows.map(async (row) => {
    const record = toJob(row);
    if (record.driver_id) {
      if (!users.has(record.driver_id)) users.set(record.driver_id, directories.findUser(record.driver_id));
      const driver = await users.get(record.driver_id)!;
      if (driver?.company_id === record.company_id) record.driver = { user_id: driver.user_id, full_name: driver.full_name, email: driver.email };
    }
    if (record.vehicle_id) {
      const key = `${record.company_id}:${record.vehicle_id}`;
      if (!vehicles.has(key)) vehicles.set(key, directories.findVehicle(record.vehicle_id, record.company_id));
      const vehicle = await vehicles.get(key)!;
      if (vehicle?.company_id === record.company_id) record.vehicle = { vehicle_id: vehicle.vehicle_id, vehicle_code: vehicle.vehicle_code, license_plate: vehicle.license_plate, vehicle_type_name: vehicle.vehicle_type_name };
    }
    return record;
  }));
}
async function target(db: Db, me: Caller, id: string) {
  const jobId = parseId(id);
  await repository.lock(db, jobId);
  const row = await repository.find(db, { job_id: jobId, ...scope(me) });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Transport job not found");
  return row;
}
async function validateAssignment(directories: Directories, company: bigint, vehicle: bigint | null, driver: bigint | null) {
  if (vehicle !== null) {
    const found = await directories.findVehicle(String(vehicle), String(company));
    if (!found || found.company_id !== String(company)) throw new ApiError(404, "NOT_FOUND", "Vehicle not found in this company");
    if (found.vehicle_status !== "active") invalid("Assigned vehicle must be active");
  }
  if (driver !== null) {
    const found = await directories.findUser(String(driver));
    if (!found || found.company_id !== String(company)) throw new ApiError(404, "NOT_FOUND", "Driver not found in this company");
    if (found.role !== "driver" || found.account_status !== "active") invalid("Assigned driver must be an active Driver account");
  }
}
function dataFor(body: UpdateTransportJobRequest, previous?: JobRow): Prisma.TransportJobUncheckedUpdateInput {
  const data: Prisma.TransportJobUncheckedUpdateInput = {};
  for (const key of ["job_code", "pickup_address", "delivery_address"] as const) if (body[key] !== undefined) data[key] = cleanText(body[key]);
  for (const key of ["job_name", "cargo_description"] as const) if (body[key] !== undefined) data[key] = optionalText(body[key]);
  for (const key of ["scheduled_start_at", "scheduled_end_at"] as const) if (body[key] !== undefined) data[key] = parseDate(body[key]);
  const start = body.scheduled_start_at === undefined ? previous?.scheduled_start_at : parseDate(body.scheduled_start_at);
  const end = body.scheduled_end_at === undefined ? previous?.scheduled_end_at : parseDate(body.scheduled_end_at);
  if (start && end && end < start) invalid("Scheduled end must be at or after scheduled start");
  for (const prefix of ["pickup", "delivery"] as const) {
    const latKey = `${prefix}_latitude` as const;
    const lonKey = `${prefix}_longitude` as const;
    const lat = body[latKey] === undefined ? (previous?.[latKey] == null ? null : Number(previous[latKey])) : body[latKey];
    const lon = body[lonKey] === undefined ? (previous?.[lonKey] == null ? null : Number(previous[lonKey])) : body[lonKey];
    if ((lat == null) !== (lon == null)) invalid("Latitude and longitude must be provided or cleared together");
    if (body[latKey] !== undefined) data[latKey] = lat;
    if (body[lonKey] !== undefined) data[lonKey] = lon;
  }
  if (body.route_snapshot !== undefined) { validateRoute(body.route_snapshot); data.route_snapshot = body.route_snapshot === null ? Prisma.DbNull : body.route_snapshot as unknown as Prisma.InputJsonValue; }
  const vehicle = body.vehicle_id === undefined ? previous?.vehicle_id ?? null : body.vehicle_id === null ? null : parseId(body.vehicle_id);
  const driver = body.driver_id === undefined ? previous?.driver_id ?? null : body.driver_id === null ? null : parseId(body.driver_id);
  data.vehicle_id = vehicle; data.driver_id = driver; data.job_status = vehicle !== null && driver !== null ? "assigned" : "pending";
  return data;
}
// Audit state changes without copying route geometry, addresses or free text into logs.
const auditState = (row: JobRow) => ({ job_code: row.job_code, job_status: row.job_status, vehicle_id: row.vehicle_id === null ? null : String(row.vehicle_id), driver_id: row.driver_id === null ? null : String(row.driver_id), accepted_at: row.accepted_at?.toISOString() ?? null, actual_start_at: row.actual_start_at?.toISOString() ?? null, actual_end_at: row.actual_end_at?.toISOString() ?? null });
async function log(db: Db, ctx: JobContext, action: string, row: JobRow, old?: JobRow) {
  await audit({ companyId: row.company_id, userId: ctx.me.user_id, action: `transport_job.${action}`, entityType: "transport_job", entityId: row.job_id, oldValue: old ? auditState(old) : undefined, newValue: auditState(row), ip: ctx.ip }, db);
}
function announceAssignment(row: JobRow) {
  if (row.job_status !== "assigned" || row.driver_id === null || row.vehicle_id === null) return;
  void raiseAlert({
    company_id: String(row.company_id),
    alert_type: "job_assignment",
    title: `New job assigned: ${row.job_code}`,
    vehicle_id: String(row.vehicle_id),
    job_id: String(row.job_id),
    recipient_user_id: String(row.driver_id),
  });
}
export async function listJobs(ctx: JobContext, query: Query, driverOnly = false) {
  if (driverOnly) requireRole(ctx.me, "driver"); else manager(ctx.me);
  const where: Prisma.TransportJobWhereInput = { ...scope(ctx.me, query.company_id), job_status: query.job_status };
  if (query.q) { const q = cleanText(query.q); where.OR = ["job_code", "job_name", "pickup_address", "delivery_address"].map((key) => ({ [key]: { contains: q, mode: "insensitive" } })); }
  return enrich(await repository.list(prisma, where, query.limit ?? 50, query.offset ?? 0), ctx.directories);
}
export async function getJob(ctx: JobContext, id: string) {
  requireRole(ctx.me, "platform_admin", "company_admin", "dispatcher", "driver");
  const row = await repository.find(prisma, { job_id: parseId(id), ...scope(ctx.me) });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Transport job not found");
  return (await enrich([row], ctx.directories))[0];
}
export async function createJob(ctx: JobContext, body: CreateTransportJobRequest) {
  manager(ctx.me);
  const company = companyScope(ctx.me, body.company_id).company_id;
  if (!company) invalid("Platform Admin must select a company");
  if (ctx.me.role === "platform_admin" && !(await ctx.directories.companyExists(String(company)))) invalid("Company does not exist");
  const data = dataFor(body) as Prisma.TransportJobUncheckedCreateInput;
  const row = await prisma.$transaction(async (tx) => {
    await validateAssignment(ctx.directories, company, data.vehicle_id as bigint | null, data.driver_id as bigint | null);
    const created = await repository.create(tx, { ...data, company_id: company, created_by: parseId(ctx.me.user_id) });
    await log(tx, ctx, "create", created); return created;
  });
  announceAssignment(row);
  return (await enrich([row], ctx.directories))[0];
}
export async function updateJob(ctx: JobContext, id: string, body: UpdateTransportJobRequest, action = "update") {
  manager(ctx.me);
  const { row, assignmentChanged } = await prisma.$transaction(async (tx) => {
    const old = await target(tx, ctx.me, id);
    if (!["pending", "assigned"].includes(old.job_status)) conflict("Only pending or assigned jobs can be edited");
    const data = dataFor(body, old);
    await validateAssignment(ctx.directories, old.company_id, data.vehicle_id as bigint | null, data.driver_id as bigint | null);
    const updated = await repository.update(tx, old.job_id, data);
    await log(tx, ctx, action, updated, old);
    return { row: updated, assignmentChanged: updated.vehicle_id !== old.vehicle_id || updated.driver_id !== old.driver_id };
  });
  if (assignmentChanged) announceAssignment(row);
  return (await enrich([row], ctx.directories))[0];
}
export async function transition(ctx: JobContext, id: string, action: "accept" | "start" | "complete" | "problem" | "cancel", note?: string) {
  if (action === "cancel") manager(ctx.me); else requireRole(ctx.me, "driver");
  const desired = { accept: "accepted", start: "in_progress", complete: "completed", problem: "problem", cancel: "cancelled" }[action] as TransportJobStatus;
  const { row, changed, wasRunning } = await prisma.$transaction(async (tx) => {
    const old = await target(tx, ctx.me, id);
    const problem = action === "problem" ? cleanText(note!) : undefined;
    if (old.job_status === desired && (action !== "problem" || old.problem_note === problem)) {
      return { row: old, changed: false, wasRunning: false };
    }
    const allowed: Record<typeof action, string[]> = { accept: ["assigned"], start: ["accepted", "problem"], complete: ["in_progress"], problem: ["accepted", "in_progress"], cancel: ["pending", "assigned", "accepted", "in_progress", "problem"] };
    if (!allowed[action].includes(old.job_status)) conflict(`Cannot ${action} a ${old.job_status} job`);
    if (action === "accept" || action === "start") {
      if (old.vehicle_id === null || old.driver_id === null) conflict("Job requires a vehicle and driver assignment");
      await repository.lockResources(tx, old.company_id, old.driver_id, old.vehicle_id);
      await validateAssignment(ctx.directories, old.company_id, old.vehicle_id, old.driver_id);
      if (await repository.activeConflict(tx, old.job_id, old.company_id, old.driver_id, old.vehicle_id)) conflict("Driver or vehicle already has an active job");
    }
    const now = new Date();
    const updated = await repository.update(tx, old.job_id, { job_status: desired,
      ...(action === "accept" ? { accepted_at: old.accepted_at ?? now } : {}),
      ...(action === "start" ? { actual_start_at: old.actual_start_at ?? now } : {}),
      ...(action === "complete" ? { actual_end_at: old.actual_end_at ?? now } : {}),
      ...(action === "problem" ? { problem_note: problem } : {}),
    });
    await log(tx, ctx, action, updated, old);
    return { row: updated, changed: true, wasRunning: old.job_status === "in_progress" };
  }, { timeout: 15000 });
  if (wasRunning && row.vehicle_id !== null && row.job_status !== "in_progress") {
    void pauseOfflineCheck(String(row.company_id), String(row.vehicle_id));
  }
  if (changed && action === "problem") {
    void raiseAlert({
      company_id: String(row.company_id),
      alert_type: "system_anomaly",
      title: `Job problem: ${row.job_code}`,
      detail: row.problem_note ?? undefined,
      vehicle_id: row.vehicle_id === null ? null : String(row.vehicle_id),
      job_id: String(row.job_id),
      event_data: { reason: "job_problem", reported_by: ctx.me.user_id },
    });
  }
  return (await enrich([row], ctx.directories))[0];
}
