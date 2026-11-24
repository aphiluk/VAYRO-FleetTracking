import { ApiError, internalClient, internalToken, required, type InternalClient } from "@vayro/service-kit";
import type { EmployeeDashboardCounts, VehicleDashboardCounts, JobDashboardCounts } from "../../../../packages/shared-types";

export interface SummarySources {
  employees(companyId: string): Promise<EmployeeDashboardCounts>;
  vehicles(companyId: string): Promise<VehicleDashboardCounts>;
  jobs(companyId: string): Promise<JobDashboardCounts>;
}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function breakdown<K extends string>(value: unknown, keys: readonly K[], total: number): Record<K, number> | null {
  const data = record(value);
  if (!data || keys.some((key) => !count(data[key])) || keys.reduce((sum, key) => sum + (data[key] as number), 0) !== total) return null;
  return Object.fromEntries(keys.map((key) => [key, data[key]])) as Record<K, number>;
}
function base(value: unknown, companyId: string) {
  const data = record(value);
  return data?.company_id === companyId && count(data.total) ? { data, total: data.total } : null;
}
export function parseEmployees(value: unknown, companyId: string): EmployeeDashboardCounts | null {
  const result = base(value, companyId);
  if (!result) return null;
  const by_role = breakdown(result.data.by_role, ["company_admin", "dispatcher", "driver"], result.total);
  const by_status = breakdown(result.data.by_status, ["active", "inactive", "suspended"], result.total);
  return by_role && by_status ? { company_id: companyId, total: result.total, by_role, by_status } : null;
}
export function parseVehicles(value: unknown, companyId: string): VehicleDashboardCounts | null {
  const result = base(value, companyId);
  if (!result) return null;
  const by_status = breakdown(result.data.by_status, ["active", "inactive", "maintenance"], result.total);
  if (!by_status || !Array.isArray(result.data.by_type)) return null;
  const by_type: VehicleDashboardCounts["by_type"] = [];
  const seen = new Set<string | null>();
  for (const item of result.data.by_type) {
    const row = record(item);
    if (!row || !count(row.count) || !(row.vehicle_type_id === null || typeof row.vehicle_type_id === "string" && /^[1-9]\d{0,18}$/.test(row.vehicle_type_id)) || !(row.type_name === null || typeof row.type_name === "string" && row.type_name.length <= 80) || seen.has(row.vehicle_type_id)) return null;
    seen.add(row.vehicle_type_id);
    by_type.push({ vehicle_type_id: row.vehicle_type_id, type_name: row.type_name, count: row.count });
  }
  return by_type.reduce((sum, row) => sum + row.count, 0) === result.total ? { company_id: companyId, total: result.total, by_status, by_type } : null;
}
export function parseJobs(value: unknown, companyId: string): JobDashboardCounts | null {
  const result = base(value, companyId);
  if (!result) return null;
  const by_status = breakdown(result.data.by_status, ["pending", "assigned", "accepted", "in_progress", "completed", "cancelled", "problem"], result.total);
  return by_status ? { company_id: companyId, total: result.total, by_status } : null;
}
async function read<T>(client: InternalClient, companyId: string, parse: (value: unknown, companyId: string) => T | null): Promise<T> {
  const { status, body } = await client("GET", `/internal/dashboard/summary?company_id=${companyId}`);
  const parsed = status === 200 && body?.success === true ? parse(body.data, companyId) : null;
  if (!parsed) throw new ApiError(503, "DASHBOARD_UNAVAILABLE", "Dashboard counts are unavailable");
  return parsed;
}
export function httpSummarySources(): SummarySources {
  const token = internalToken();
  const users = internalClient(required("USER_SERVICE_URL"), token);
  const vehicles = internalClient(required("VEHICLE_SERVICE_URL"), token);
  const jobs = internalClient(required("TRANSPORT_SERVICE_URL"), token);
  return { employees: (id) => read(users, id, parseEmployees), vehicles: (id) => read(vehicles, id, parseVehicles), jobs: (id) => read(jobs, id, parseJobs) };
}
