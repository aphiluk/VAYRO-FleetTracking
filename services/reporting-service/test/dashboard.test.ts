import { describe, expect, test } from "bun:test";
import { ApiError, type Caller } from "@vayro/service-kit";
import type { SummarySources } from "../src/adapters/summaries";
for (const service of ["AUTH", "COMPANY", "USER", "VEHICLE", "GPS_DEVICE", "GPS_DATA", "TRANSPORT", "ALERT"]) {
  process.env[`${service}_SERVICE_URL`] ??= "http://unused.test";
}
process.env.INTERNAL_API_TOKEN ??= "reporting-test-token-not-for-deployment-123456";
const { createReportingApp } = await import("../src/app");
const { parseEmployees, parseVehicles, parseJobs } = await import("../src/adapters/summaries");
const person = (role: Caller["role"], company_id: string | null = "1"): Caller => ({ user_id: "1", full_name: "Test", email: "test@example.test", phone: null, account_status: "active", workspace_status: "active", role, company_id });
const employees = (company_id: string) => ({ company_id, total: 108, by_role: { company_admin: 1, dispatcher: 2, driver: 105 }, by_status: { active: 106, inactive: 1, suspended: 1 } });
const vehicles = (company_id: string) => ({ company_id, total: 2, by_status: { active: 1, inactive: 0, maintenance: 1 }, by_type: [{ vehicle_type_id: "1", type_name: "รถบรรทุก", count: 1 }, { vehicle_type_id: null, type_name: null, count: 1 }] });
const jobs = (company_id: string) => ({ company_id, total: 7, by_status: { pending: 1, assigned: 1, accepted: 1, in_progress: 1, completed: 1, cancelled: 1, problem: 1 } });
const calls: string[] = [];
const sources: SummarySources = { employees: async (id) => { calls.push(id); return employees(id); }, vehicles: async (id) => { calls.push(id); return vehicles(id); }, jobs: async (id) => { calls.push(id); return jobs(id); } };
function app(me: Caller | null, overrides: Partial<SummarySources> = {}) { return createReportingApp({ resolveUser: async () => { if (!me) throw new ApiError(401, "UNAUTHORIZED", "No user"); return me; }, summarySources: { ...sources, ...overrides } }).compile(); }
async function call(server: ReturnType<typeof app>, suffix = "") { const response = await server.handle(new Request(`http://localhost/api/v1/dashboard/company/summary${suffix}`)); return { response, json: await response.json() }; }

describe("Company dashboard authorization and aggregation", () => {
  test("health is public; missing login, Driver, Dispatcher, Platform Admin and unscoped accounts cannot read company counts", async () => {
    const health = await app(null).handle(new Request("http://localhost/")); expect(health.status).toBe(200);
    calls.length = 0;
    expect((await call(app(null))).response.status).toBe(401);
    for (const role of ["driver", "dispatcher", "platform_admin"] as const) expect((await call(app(person(role)))).response.status).toBe(403);
    expect((await call(app(person("company_admin", null)))).response.status).toBe(403);
    expect(calls).toEqual([]);
  });
  test("all sources use the authenticated company and return complete totals beyond a first page", async () => {
    for (const id of ["1", "2"]) {
      calls.length = 0; const { response, json } = await call(app(person("company_admin", id)));
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
      expect(calls).toEqual([id, id, id]); expect(json.data.company_id).toBe(id); expect(json.data.employees.total).toBe(108);
      expect(json.data.vehicles.total).toBe(2); expect(json.data.jobs.total).toBe(7); expect(Number.isFinite(Date.parse(json.data.generated_at))).toBe(true);
    }
  });
  test("a caller cannot select or override a workspace using query parameters", async () => {
    calls.length = 0;
    for (const suffix of ["?company_id=2", "?company_id=1", "?q=anything"]) expect((await call(app(person("company_admin")), suffix)).response.status).toBe(422);
    expect(calls).toEqual([]);
  });
  test("source failure fails the summary rather than returning partial zero counts", async () => {
    const { response, json } = await call(app(person("company_admin"), { vehicles: async () => { throw new ApiError(503, "DASHBOARD_UNAVAILABLE", "Unavailable"); } }));
    expect(response.status).toBe(503); expect(json.success).toBe(false); expect(json.data).toBeUndefined();
  });
  test("summary parsers reject another company, missing counts, negative counts and inconsistent totals", () => {
    expect(parseEmployees(employees("2"), "1")).toBeNull(); expect(parseVehicles(vehicles("2"), "1")).toBeNull(); expect(parseJobs(jobs("2"), "1")).toBeNull();
    expect(parseEmployees({ ...employees("1"), by_role: {} }, "1")).toBeNull();
    expect(parseJobs({ ...jobs("1"), total: 8 }, "1")).toBeNull();
    expect(parseVehicles({ ...vehicles("1"), by_status: { active: -1, inactive: 2, maintenance: 1 } }, "1")).toBeNull();
    expect(parseVehicles({ ...vehicles("1"), by_type: [] }, "1")).toBeNull();
    expect(parseVehicles({ ...vehicles("1"), by_type: [{ vehicle_type_id: "1", type_name: "A", count: 1 }, { vehicle_type_id: "1", type_name: "A", count: 1 }] }, "1")).toBeNull();
  });
  test("only aggregate fields leave the parsers, with legitimate empty counts preserved", () => {
    const empty = { company_id: "1", total: 0, by_role: { company_admin: 0, dispatcher: 0, driver: 0 }, by_status: { active: 0, inactive: 0, suspended: 0 }, email: "private@example.test" };
    const parsed = parseEmployees(empty, "1"); expect(parsed?.total).toBe(0); expect(parsed).not.toHaveProperty("email");
    expect(parseVehicles(vehicles("1"), "1")?.by_type.length).toBe(2); expect(parseJobs(jobs("1"), "1")?.total).toBe(7);
  });
});
