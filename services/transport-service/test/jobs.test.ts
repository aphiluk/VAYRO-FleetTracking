// Integration tests: real transport_db, injectable auth/directory services, unique tenant fixtures.
import { afterAll, describe, expect, test } from "bun:test";
import { ApiError, type Caller } from "@vayro/service-kit";
import type { Directories, DriverInfo, VehicleInfo } from "../src/adapters/directories";
import type { NavigationRoute } from "../../../packages/shared-types";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the transport service database");
process.env.INTERNAL_API_TOKEN ??= "transport-test-internal-token-not-for-deployment-123456";
for (const name of ["AUTH_SERVICE_URL", "USER_SERVICE_URL", "VEHICLE_SERVICE_URL", "COMPANY_SERVICE_URL"]) process.env[name] ??= "http://unused.test";
const { createTransportApp } = await import("../src/app");
const { prisma } = await import("../src/lib/prisma");
const run = String(BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)));
const ca = run, cb = String(BigInt(run) + 1n), da = String(BigInt(run) + 2n), db = String(BigInt(run) + 3n), dc = String(BigInt(run) + 4n);
const va = String(BigInt(run) + 5n), vb = String(BigInt(run) + 6n), vc = String(BigInt(run) + 7n);
const person = (id: string, company: string, role = "driver", status = "active"): DriverInfo => ({ user_id: id, company_id: company, role, account_status: status, full_name: `Driver ${id}`, email: `${id}@example.test` });
const users = new Map([[da, person(da, ca)], [db, person(db, cb)], [dc, person(dc, ca)]]);
const vehicle = (id: string, company: string): VehicleInfo => ({ vehicle_id: id, company_id: company, vehicle_status: "active", vehicle_code: `V-${id}`, license_plate: "ทดสอบ", vehicle_type_name: "รถบรรทุก" });
const vehicles = new Map([[va, vehicle(va, ca)], [vb, vehicle(vb, cb)], [vc, vehicle(vc, ca)]]);
const directories: Directories = { findUser: async (id) => users.get(id) ?? null, findVehicle: async (id, company) => { const v = vehicles.get(id); return v?.company_id === company ? v : null; }, companyExists: async (id) => [ca, cb].includes(id) };
const caller = (role: Caller["role"], company: string | null, id = "1"): Caller => ({ role, company_id: company, user_id: id, full_name: "Test", email: "test@example.test", phone: null, account_status: "active", workspace_status: company ? "active" : null });
const identities = new Map<string, Caller>([["admin-a", caller("company_admin", ca)], ["admin-b", caller("company_admin", cb)], ["dispatcher", caller("dispatcher", ca)], ["driver-a", caller("driver", ca, da)], ["driver-b", caller("driver", cb, db)], ["driver-c", caller("driver", ca, dc)], ["platform", caller("platform_admin", null)]]);
const app = createTransportApp({ directories, resolveUser: async (header) => { const me = identities.get(header?.replace(/^Bearer /, "") ?? ""); if (!me) throw new ApiError(401, "UNAUTHORIZED", "Invalid access token"); return me; } }).compile();
async function call(method: string, path: string, token?: string, body?: object) {
  const response = await app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: response.status, json: await response.json() };
}
let seq = 0;
const input = (extra: object = {}) => ({ job_code: `TEST-${++seq}`, pickup_address: "กรุงเทพ", delivery_address: "ระยอง", ...extra });
async function create(extra: object = {}, token = "admin-a") { const r = await call("POST", "/jobs", token, input(extra)); expect(r.status).toBe(201); return r.json.data; }
const route: NavigationRoute = { provider: "valhalla", profile: "auto", geometry: { type: "LineString", coordinates: [[100, 13], [101, 14]] }, distance_meters: 1000, duration_seconds: 100, steps: [{ instruction: "ไปตรง", distance_meters: 1000, duration_seconds: 100, begin_shape_index: 0, end_shape_index: 1 }] };
afterAll(async () => { await prisma.$disconnect(); });

describe("Transport job API", () => {
  test("authentication, roles, company boundaries and driver ownership", async () => {
    const a = await create({ vehicle_id: va, driver_id: da });
    const b = await create({ vehicle_id: vb, driver_id: db }, "admin-b");
    expect((await call("GET", "/jobs")).status).toBe(401);
    expect((await call("GET", "/jobs", "driver-a")).status).toBe(403);
    expect((await call("GET", "/driver/jobs", "dispatcher")).status).toBe(403);
    expect((await call("POST", "/jobs", "driver-a", input())).status).toBe(403);
    expect((await call("GET", `/jobs/${b.job_id}`, "admin-a")).status).toBe(404);
    expect((await call("GET", `/jobs/${a.job_id}`, "driver-c")).status).toBe(404);
    expect((await call("GET", `/jobs?company_id=${cb}`, "admin-a")).status).toBe(403);
    expect((await call("GET", `/driver/jobs?company_id=${cb}`, "driver-a")).status).toBe(403);
    expect((await call("POST", "/jobs", "admin-a", input({ company_id: cb }))).status).toBe(403);
    expect((await call("PATCH", `/jobs/${b.job_id}/assign`, "admin-a", { vehicle_id: va, driver_id: da })).status).toBe(404);
    for (const action of ["accept", "start", "complete", "problem"]) {
      const body = action === "problem" ? { problem_note: "Denied" } : {};
      expect((await call("PATCH", `/jobs/${a.job_id}/${action}`, "dispatcher", body)).status).toBe(403);
      expect((await call("PATCH", `/jobs/${a.job_id}/${action}`, "driver-c", body)).status).toBe(404);
    }
    expect((await call("PATCH", `/jobs/${a.job_id}/assign`, "driver-a", { vehicle_id: vc, driver_id: da })).status).toBe(403);
    expect((await call("PATCH", `/jobs/${a.job_id}/cancel`, "driver-a")).status).toBe(403);
    expect((await call("GET", "/driver/jobs", "driver-a")).json.data.every((r: { driver_id: string }) => r.driver_id === da)).toBe(true);
    expect((await call("GET", `/jobs?company_id=${ca}`, "platform")).json.data.every((r: { company_id: string }) => r.company_id === ca)).toBe(true);
    expect((await call("POST", "/jobs", "platform", input())).status).toBe(422);
    expect((await call("POST", "/jobs", "platform", input({ company_id: "999999999999" }))).status).toBe(422);
    const platformCreated = await create({ company_id: ca }, "platform");
    expect(platformCreated.company_id).toBe(ca);
  });

  test("full accept, problem, resume and completion flow preserves times and metadata", async () => {
    const job = await create({ vehicle_id: va, driver_id: da, cargo_description: " กล่องสินค้า ", route_snapshot: route, pickup_latitude: 13, pickup_longitude: 100, scheduled_start_at: "2026-11-19T09:00:00+07:00", scheduled_end_at: "2026-11-19T11:00:00+07:00" });
    expect(job).toMatchObject({ job_status: "assigned", accepted_at: null, cargo_description: "กล่องสินค้า", route_snapshot: route, pickup_latitude: 13, pickup_longitude: 100, scheduled_start_at: "2026-11-19T02:00:00.000Z", driver: { user_id: da }, vehicle: { vehicle_id: va, license_plate: "ทดสอบ", vehicle_type_name: "รถบรรทุก" } });
    expect((await call("PATCH", `/jobs/${job.job_id}/start`, "driver-a")).status).toBe(409);
    const accepted = await call("PATCH", `/jobs/${job.job_id}/accept`, "driver-a");
    expect(accepted.status).toBe(200); expect(accepted.json.data.job_status).toBe("accepted"); expect(accepted.json.data.accepted_at).not.toBeNull();
    const retry = await call("PATCH", `/jobs/${job.job_id}/accept`, "driver-a", {});
    expect(retry.json.data.accepted_at).toBe(accepted.json.data.accepted_at); expect(retry.json.data.updated_at).toBe(accepted.json.data.updated_at);
    expect((await call("PUT", `/jobs/${job.job_id}`, "admin-a", { job_name: "Denied" })).status).toBe(409);
    expect((await call("PATCH", `/jobs/${job.job_id}/complete`, "driver-a")).status).toBe(409);
    const started = (await call("PATCH", `/jobs/${job.job_id}/start`, "driver-a", {})).json.data;
    expect(started.job_status).toBe("in_progress"); expect(started.actual_start_at).not.toBeNull();
    const gps = await app.handle(new Request(`http://localhost/internal/jobs/in-progress?company_id=${ca}&vehicle_id=${va}&driver_id=${da}`, { headers: { "x-internal-token": process.env.INTERNAL_API_TOKEN! } }));
    expect(await gps.json()).toMatchObject({ data: { exists: true } });
    const problem = await call("PATCH", `/jobs/${job.job_id}/problem`, "driver-a", { problem_note: " ยางรั่ว " });
    expect(problem.json.data).toMatchObject({ job_status: "problem", problem_note: "ยางรั่ว" });
    expect((await call("PATCH", `/jobs/${job.job_id}/problem`, "driver-a", { problem_note: "ยางรั่ว" })).json.data.updated_at).toBe(problem.json.data.updated_at);
    expect((await call("PATCH", `/jobs/${job.job_id}/problem`, "driver-a", { problem_note: "ข้อความใหม่" })).status).toBe(409);
    const resumed = (await call("PATCH", `/jobs/${job.job_id}/start`, "driver-a")).json.data;
    expect(resumed.actual_start_at).toBe(started.actual_start_at);
    const done = await call("PATCH", `/jobs/${job.job_id}/complete`, "driver-a"); expect(done.json.data.job_status).toBe("completed"); expect(done.json.data.actual_end_at).not.toBeNull();
    const repeated = await call("PATCH", `/jobs/${job.job_id}/complete`, "driver-a", {}); expect(repeated.json.data.actual_end_at).toBe(done.json.data.actual_end_at);
    for (const action of ["start", "accept", "cancel"]) expect((await call("PATCH", `/jobs/${job.job_id}/${action}`, action === "cancel" ? "admin-a" : "driver-a")).status).toBe(409);
  });

  test("assignment validation checks company, active vehicle and actual Driver role", async () => {
    expect((await call("POST", "/jobs", "admin-a", input({ vehicle_id: vb, driver_id: da }))).status).toBe(404);
    expect((await call("POST", "/jobs", "admin-a", input({ vehicle_id: va, driver_id: db }))).status).toBe(404);
    vehicles.get(va)!.vehicle_status = "maintenance";
    try { expect((await call("POST", "/jobs", "admin-a", input({ vehicle_id: va }))).status).toBe(422); } finally { vehicles.get(va)!.vehicle_status = "active"; }
    for (const value of [person(da, ca, "dispatcher"), person(da, ca, "driver", "inactive")]) {
      users.set(da, value);
      try { expect((await call("POST", "/jobs", "admin-a", input({ driver_id: da }))).status).toBe(422); } finally { users.set(da, person(da, ca)); }
    }
    const a = await create({ vehicle_id: va, driver_id: da });
    users.set(da, person(da, ca, "driver", "inactive"));
    try { expect((await call("PATCH", `/jobs/${a.job_id}/accept`, "driver-a")).status).toBe(422); } finally { users.set(da, person(da, ca)); }
    await call("PATCH", `/jobs/${a.job_id}/accept`, "driver-a");
    vehicles.get(va)!.vehicle_status = "inactive";
    try { expect((await call("PATCH", `/jobs/${a.job_id}/start`, "driver-a")).status).toBe(422); } finally { vehicles.get(va)!.vehicle_status = "active"; }
    expect((await call("PATCH", `/jobs/${a.job_id}/cancel`, "dispatcher")).status).toBe(200);
  });

  test("pending jobs edit, assign, filter and cancel without deleting records", async () => {
    const job = await create({ vehicle_id: va }); expect(job.job_status).toBe("pending");
    const assigned = await call("PATCH", `/jobs/${job.job_id}/assign`, "dispatcher", { vehicle_id: va, driver_id: da }); expect(assigned.json.data.job_status).toBe("assigned");
    const changes = await Promise.all([call("PUT", `/jobs/${job.job_id}`, "admin-a", { job_name: "พร้อมกัน" }), call("PUT", `/jobs/${job.job_id}`, "dispatcher", { cargo_description: "สินค้า" })]);
    expect(changes.every((r) => r.status === 200)).toBe(true);
    expect((await call("GET", `/jobs/${job.job_id}`, "admin-a")).json.data).toMatchObject({ job_name: "พร้อมกัน", cargo_description: "สินค้า" });
    expect((await call("PATCH", `/jobs/${job.job_id}/assign`, "admin-a", { vehicle_id: null, driver_id: null })).json.data.job_status).toBe("pending");
    const filtered = await call("GET", `/jobs?q=${job.job_code}&job_status=pending&limit=1&offset=0`, "admin-a"); expect(filtered.json.data).toHaveLength(1);
    expect((await call("GET", `/jobs?q=${job.job_code}&limit=1&offset=1`, "admin-a")).json.data).toHaveLength(0);
    const cancelled = await call("PATCH", `/jobs/${job.job_id}/cancel`, "dispatcher"); expect(cancelled.json.data.job_status).toBe("cancelled");
    expect((await call("PATCH", `/jobs/${job.job_id}/cancel`, "dispatcher", {})).json.data.updated_at).toBe(cancelled.json.data.updated_at);
    expect((await call("PUT", `/jobs/${job.job_id}`, "admin-a", { job_name: "No" })).status).toBe(409);
    expect((await call("GET", `/jobs/${job.job_id}`, "admin-a")).status).toBe(200);
  });

  test("untrusted ids, field injection, coordinates, dates and bounded route snapshots", async () => {
    const badBodies = [
      { job_code: "   " }, { pickup_address: "\u0000" }, { pickup_latitude: 91, pickup_longitude: 100 }, { pickup_latitude: 13 }, { delivery_longitude: 100 },
      { scheduled_start_at: "2026-02-30T10:00:00Z" }, { scheduled_start_at: "2026-11-19T24:00:00Z" }, { scheduled_start_at: "2026-11-19T10:00:00" },
      { scheduled_start_at: "2026-11-19T11:00:00Z", scheduled_end_at: "2026-11-19T10:00:00Z" }, { cargo_description: "x".repeat(2001) },
      { route_snapshot: { ...route, steps: [{ ...route.steps[0], end_shape_index: 2 }] } }, { route_snapshot: { ...route, geometry: { ...route.geometry, coordinates: Array.from({ length: 25001 }, () => [100, 13]) } } },
      { route_snapshot: { ...route, steps: Array.from({ length: 2001 }, () => route.steps[0]) } }, { route_snapshot: { ...route, geometry: { ...route.geometry, coordinates: [[181, 13], [100, 14]] } } },
      { job_status: "completed" }, { created_by: "777" }, { vehicle_id: "1.5" },
    ];
    for (const body of badBodies) expect((await call("POST", "/jobs", "admin-a", input(body))).status).toBe(422);
    for (const path of ["/jobs/0", "/jobs/-1", "/jobs/9223372036854775808", "/jobs?limit=101", "/jobs?offset=-1", "/jobs?job_status=unknown"]) expect((await call("GET", path, "admin-a")).status).toBe(422);
    const a = await create({ pickup_latitude: 13, pickup_longitude: 100 });
    expect((await call("PUT", `/jobs/${a.job_id}`, "admin-a", { pickup_latitude: null })).status).toBe(422);
    expect((await call("PUT", `/jobs/${a.job_id}`, "admin-a", { pickup_latitude: null, pickup_longitude: null, route_snapshot: null })).json.data.pickup_latitude).toBeNull();
    expect((await call("PUT", `/jobs/${a.job_id}`, "admin-a", { company_id: cb })).status).toBe(422);
    expect((await call("PATCH", `/jobs/${a.job_id}/cancel`, "admin-a", { job_status: "completed" })).status).toBe(422);
  });

  test("concurrent acceptance reserves both driver and vehicle and retries are idempotent", async () => {
    for (const assignments of [[{ vehicle_id: va, driver_id: da }, { vehicle_id: vc, driver_id: da }], [{ vehicle_id: va, driver_id: da }, { vehicle_id: va, driver_id: dc }]]) {
      const jobs = await Promise.all(assignments.map((a) => create(a)));
      const results = await Promise.all(jobs.map((j, i) => call("PATCH", `/jobs/${j.job_id}/accept`, assignments[i].driver_id === da ? "driver-a" : "driver-c")));
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = results.findIndex((r) => r.status === 200);
      const retries = await Promise.all([0, 1, 2].map(() => call("PATCH", `/jobs/${jobs[winner].job_id}/accept`, assignments[winner].driver_id === da ? "driver-a" : "driver-c")));
      expect(retries.every((r) => r.status === 200 && r.json.data.accepted_at === results[winner].json.data.accepted_at)).toBe(true);
      await call("PATCH", `/jobs/${jobs[winner].job_id}/cancel`, "admin-a");
    }
    const same = input(); const duplicate = await Promise.all([call("POST", "/jobs", "admin-a", same), call("POST", "/jobs", "admin-a", same)]); expect(duplicate.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  test("problem before start may resume; audit is atomic and omits precise location and free text", async () => {
    const job = await create({ vehicle_id: vc, driver_id: dc });
    await call("PATCH", `/jobs/${job.job_id}/accept`, "driver-c");
    expect((await call("PATCH", `/jobs/${job.job_id}/problem`, "driver-c", { problem_note: "Loading delay" })).status).toBe(200);
    const started = await call("PATCH", `/jobs/${job.job_id}/start`, "driver-c"); expect(started.json.data.actual_start_at).not.toBeNull();
    await call("PATCH", `/jobs/${job.job_id}/complete`, "driver-c");
    const logs = await prisma.systemLog.findMany({ where: { company_id: BigInt(ca), entity_id: job.job_id } });
    expect(logs.map((r) => r.action)).toEqual(expect.arrayContaining(["transport_job.create", "transport_job.accept", "transport_job.start", "transport_job.problem", "transport_job.complete"]));
    expect(JSON.stringify(logs.map(({ old_value, new_value }) => ({ old_value, new_value })))).not.toMatch(/route_snapshot|latitude|longitude|address|password|token|problem_note/);
    const editable = await create(); const trigger = `transport_audit_${run}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON system_log FOR EACH ROW WHEN (NEW.entity_id='${editable.job_id}' AND NEW.action='transport_job.update') EXECUTE FUNCTION ${trigger}()`);
    try {
      expect((await call("PUT", `/jobs/${editable.job_id}`, "admin-a", { job_name: "Must roll back" })).status).toBe(500);
      expect((await call("GET", `/jobs/${editable.job_id}`, "admin-a")).json.data.job_name).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON system_log`); await prisma.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
  });
});
