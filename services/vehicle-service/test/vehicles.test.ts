// Integration tests use vehicle_db and unique fixture company ids. Other services are injected adapters.
// DATABASE_URL must point to the vehicle service's own test/local database. Fixtures are retained.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApiError, type Caller } from "@vayro/service-kit";
import type { Directories, DriverInfo } from "../src/adapters/directories";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the vehicle_db connection string");
process.env.INTERNAL_API_TOKEN ??= "vehicle-test-internal-token-not-for-deployment-123456";
process.env.AUTH_SERVICE_URL ??= "http://unused-auth.test";
process.env.USER_SERVICE_URL ??= "http://unused-user.test";
process.env.COMPANY_SERVICE_URL ??= "http://unused-company.test";
const { createVehicleApp } = await import("../src/app");
const { prisma } = await import("../src/lib/prisma");

const run = String(BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)));
const companyA = run;
const companyB = String(BigInt(run) + 1n);
const driverA = String(BigInt(run) + 2n);
const driverB = String(BigInt(run) + 3n);
const inactiveDriver = String(BigInt(run) + 4n);
const dispatcherId = String(BigInt(run) + 5n);
const driverInfo = (id: string, company: string, role = "driver", status = "active"): DriverInfo => ({ user_id: id, company_id: company, role, account_status: status });
const people = new Map<string, DriverInfo>([
  [driverA, driverInfo(driverA, companyA)],
  [driverB, driverInfo(driverB, companyB)],
  [inactiveDriver, driverInfo(inactiveDriver, companyA, "driver", "inactive")],
  [dispatcherId, driverInfo(dispatcherId, companyA, "dispatcher")],
]);
const directories: Directories = {
  findUser: async (id) => people.get(id) ?? null,
  companyExists: async (id) => [companyA, companyB].includes(id),
};
const caller = (role: Caller["role"], company: string | null): Caller => ({ role, company_id: company, user_id: "1", full_name: "Test", email: "test@example.test", phone: null, account_status: "active", workspace_status: company ? "active" : null });
const identities = new Map<string, Caller>([
  ["admin-a", caller("company_admin", companyA)], ["admin-b", caller("company_admin", companyB)],
  ["dispatcher", caller("dispatcher", companyA)], ["driver", caller("driver", companyA)], ["platform", caller("platform_admin", null)],
]);
const resolveUser = async (authorization?: string | null) => {
  const identity = identities.get(authorization?.match(/^Bearer (\S+)$/i)?.[1] ?? "");
  if (!identity) throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid access token");
  return identity;
};
const app = createVehicleApp({ resolveUser, directories }).compile();
async function call(method: string, path: string, token?: string, body?: object) {
  const response = await app.handle(new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: response.status, json: await response.json() };
}
let typeA: string;
let typeB: string;
let vehicleA: string;
let vehicleB: string;

beforeAll(async () => {
  const a = await call("POST", "/vehicle-types", "admin-a", { type_name: "รถบรรทุก", description: "Fixture" });
  const b = await call("POST", "/vehicle-types", "admin-b", { type_name: "รถบรรทุก" });
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  typeA = a.json.data.vehicle_type_id;
  typeB = b.json.data.vehicle_type_id;
  const va = await call("POST", "/vehicles", "admin-a", { vehicle_code: "BASE-A", license_plate: "ทดสอบ A", vehicle_type_id: typeA, current_driver_id: driverA });
  const vb = await call("POST", "/vehicles", "admin-b", { vehicle_code: "BASE-A", license_plate: "ทดสอบ B", vehicle_type_id: typeB, current_driver_id: driverB });
  expect(va.status).toBe(201);
  expect(vb.status).toBe(201);
  vehicleA = va.json.data.vehicle_id;
  vehicleB = vb.json.data.vehicle_id;
});
afterAll(async () => { await prisma.$disconnect(); });

describe("vehicle management API", () => {
  test("authentication and role restrictions run before management access", async () => {
    expect((await call("GET", "/vehicles")).status).toBe(401);
    expect((await call("GET", "/vehicles", "driver")).status).toBe(403);
    expect((await call("GET", "/vehicle-types", "driver")).status).toBe(403);
    expect((await call("GET", "/vehicles", "dispatcher")).status).toBe(200);
    expect((await call("GET", "/vehicle-types", "dispatcher")).status).toBe(200);
    expect((await call("POST", "/vehicles", "dispatcher", { vehicle_code: "DENIED", license_plate: "DENIED" })).status).toBe(403);
    expect((await call("PATCH", `/vehicles/${vehicleA}/status`, "dispatcher", { vehicle_status: "inactive" })).status).toBe(403);
    expect((await call("DELETE", `/vehicle-types/${typeA}`, "dispatcher")).status).toBe(403);
  });

  test("reads, writes and relation assignments cannot cross company boundaries", async () => {
    const own = await call("GET", "/vehicles", "admin-a");
    expect(own.json.data.every((vehicle: { company_id: string }) => vehicle.company_id === companyA)).toBe(true);
    expect((await call("GET", `/vehicles?company_id=${companyB}`, "admin-a")).status).toBe(403);
    expect((await call("GET", `/vehicle-types?company_id=${companyB}`, "admin-a")).status).toBe(403);
    expect((await call("GET", `/vehicles/${vehicleB}`, "admin-a")).status).toBe(404);
    expect((await call("PUT", `/vehicles/${vehicleB}`, "admin-a", { license_plate: "Forbidden" })).status).toBe(404);
    expect((await call("DELETE", `/vehicles/${vehicleB}`, "admin-a")).status).toBe(404);
    expect((await call("PUT", `/vehicle-types/${typeB}`, "admin-a", { type_name: "Forbidden" })).status).toBe(404);
    expect((await call("POST", "/vehicles", "admin-a", { vehicle_code: "FORGED", license_plate: "FORGED", company_id: companyB })).status).toBe(403);
    expect((await call("POST", "/vehicle-types", "admin-a", { type_name: "FORGED", company_id: companyB })).status).toBe(403);
    expect((await call("PUT", `/vehicles/${vehicleA}`, "admin-a", { vehicle_type_id: typeB })).status).toBe(404);
    expect((await call("PATCH", `/vehicles/${vehicleA}/driver`, "admin-a", { current_driver_id: driverB })).status).toBe(404);
    expect((await call("PUT", `/vehicles/${vehicleA}`, "admin-a", { company_id: companyB })).status).toBe(422);
  });

  test("platform creation requires an existing selected company and can read the selected company's records", async () => {
    expect((await call("POST", "/vehicles", "platform", { vehicle_code: "PLATFORM", license_plate: "P" })).status).toBe(422);
    expect((await call("POST", "/vehicle-types", "platform", { type_name: "Missing", company_id: "9223372036854775807" })).status).toBe(422);
    const created = await call("POST", "/vehicles", "platform", { vehicle_code: "PLATFORM", license_plate: "P", company_id: companyB });
    expect(created.status).toBe(201);
    expect(created.json.data.company_id).toBe(companyB);
    const selected = await call("GET", `/vehicles?company_id=${companyB}`, "platform");
    expect(selected.json.data.every((vehicle: { company_id: string }) => vehicle.company_id === companyB)).toBe(true);
  });

  test("validates body, pagination, ids, empty updates and null text fields", async () => {
    for (const code of ["", "   ", "x".repeat(51), "null\u0000byte"]) {
      expect((await call("POST", "/vehicles", "admin-a", { vehicle_code: code, license_plate: "ทดสอบ" })).status).toBe(422);
    }
    for (const query of ["limit=0", "limit=101", "limit=1.5", "offset=-1", "offset=2147483648", "vehicle_status=deleted", "q=%20%20"]) {
      expect((await call("GET", `/vehicles?${query}`, "admin-a")).status).toBe(422);
    }
    for (const id of ["0", "01", "abc", "9223372036854775808"]) expect((await call("GET", `/vehicles/${id}`, "admin-a")).status).toBe(422);
    for (const body of [{}, { license_plate: null }, { current_driver_id: 1 }, { unknown: "x" }]) {
      expect((await call("PUT", `/vehicles/${vehicleA}`, "admin-a", body)).status).toBe(422);
    }
    expect((await call("PUT", `/vehicle-types/${typeA}`, "admin-a", {})).status).toBe(422);
    expect((await call("GET", "/vehicle-types?is_active=maybe", "admin-a")).status).toBe(422);
  });

  test("creates minimal vehicles, trims text, preserves optional nulls and enforces only company vehicle-code uniqueness", async () => {
    const input = { vehicle_code: " MINIMAL ", license_plate: " กข 1234 " };
    const first = await call("POST", "/vehicles", "admin-a", input);
    expect(first.status).toBe(201);
    expect(first.json.data).toMatchObject({ vehicle_code: "MINIMAL", license_plate: "กข 1234", vehicle_type_id: null, current_driver_id: null, vehicle_status: "active", company_id: companyA });
    expect(Number.isFinite(Date.parse(first.json.data.created_at))).toBe(true);
    expect((await call("POST", "/vehicles", "admin-a", input)).status).toBe(409);
    expect((await call("POST", "/vehicles", "admin-a", { ...input, vehicle_code: "OTHER-SAME-PLATE" })).status).toBe(201);
  });

  test("new driver assignments require active Driver accounts in the company and accept explicit null to unassign", async () => {
    for (const [driver, expected] of [[inactiveDriver, 422], [dispatcherId, 422], ["9223372036854775807", 404]] as const) {
      expect((await call("PATCH", `/vehicles/${vehicleA}/driver`, "admin-a", { current_driver_id: driver })).status).toBe(expected);
    }
    expect((await call("PATCH", `/vehicles/${vehicleA}/driver`, "admin-a", { current_driver_id: null })).json.data.current_driver_id).toBeNull();
    expect((await call("PATCH", `/vehicles/${vehicleA}/driver`, "admin-a", { current_driver_id: driverA })).json.data.current_driver_id).toBe(driverA);
  });

  test("inactive type and driver references remain editable on an existing vehicle while new assignments are rejected", async () => {
    expect((await call("DELETE", `/vehicle-types/${typeA}`, "admin-a")).json.data.is_active).toBe(false);
    people.set(driverA, driverInfo(driverA, companyA, "driver", "inactive"));
    try {
      const update = await call("PUT", `/vehicles/${vehicleA}`, "admin-a", { license_plate: "แก้ทะเบียน", vehicle_type_id: typeA, current_driver_id: driverA });
      expect(update.status).toBe(200);
      expect(update.json.data).toMatchObject({ license_plate: "แก้ทะเบียน", vehicle_type_id: typeA, current_driver_id: driverA });
      expect((await call("POST", "/vehicles", "admin-a", { vehicle_code: "INACTIVE-TYPE", license_plate: "test", vehicle_type_id: typeA })).status).toBe(422);
      expect((await call("POST", "/vehicles", "admin-a", { vehicle_code: "INACTIVE-DRIVER", license_plate: "test", current_driver_id: driverA })).status).toBe(422);
      people.set(driverA, driverInfo(driverA, companyB));
      expect((await call("PUT", `/vehicles/${vehicleA}`, "admin-a", { license_plate: "Foreign reference" })).status).toBe(404);
    } finally {
      people.set(driverA, driverInfo(driverA, companyA));
      await call("PUT", `/vehicle-types/${typeA}`, "admin-a", { is_active: true });
    }
  });

  test("types can be created, renamed, filtered and soft-disabled without deleting vehicle references", async () => {
    const created = await call("POST", "/vehicle-types", "admin-a", { type_name: " รถยนต์ ", description: "   " });
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ type_name: "รถยนต์", description: null, is_active: true, company_id: companyA });
    const id = created.json.data.vehicle_type_id;
    expect((await call("POST", "/vehicle-types", "admin-a", { type_name: "รถยนต์" })).status).toBe(409);
    const renamed = await call("PUT", `/vehicle-types/${id}`, "admin-a", { type_name: " รถส่วนกลาง ", description: " สำหรับทดสอบ " });
    expect(renamed.json.data).toMatchObject({ type_name: "รถส่วนกลาง", description: "สำหรับทดสอบ" });
    expect((await call("PUT", `/vehicle-types/${id}`, "admin-a", { type_name: "รถบรรทุก" })).status).toBe(409);
    await call("DELETE", `/vehicle-types/${id}`, "admin-a");
    const inactive = await call("GET", "/vehicle-types?is_active=false", "admin-a");
    expect(inactive.json.data.some((type: { vehicle_type_id: string }) => type.vehicle_type_id === id)).toBe(true);
    const active = await call("GET", "/vehicle-types?is_active=true", "admin-a");
    expect(active.json.data.some((type: { vehicle_type_id: string }) => type.vehicle_type_id === id)).toBe(false);
    expect((await call("GET", `/vehicles/${vehicleA}`, "admin-a")).json.data.vehicle_type_id).toBe(typeA);
  });

  test("simultaneous duplicate creations produce one row and concurrent partial updates preserve both changes", async () => {
    const input = { vehicle_code: "CONCURRENT", license_plate: "ก่อนแก้ไข" };
    const created = await Promise.all([call("POST", "/vehicles", "admin-a", input), call("POST", "/vehicles", "admin-a", input)]);
    expect(created.map(({ status }) => status).sort()).toEqual([201, 409]);
    const id = created.find(({ status }) => status === 201)!.json.data.vehicle_id;
    const updated = await Promise.all([
      call("PUT", `/vehicles/${id}`, "admin-a", { license_plate: "แก้พร้อมกัน" }),
      call("PATCH", `/vehicles/${id}/status`, "admin-a", { vehicle_status: "maintenance" }),
    ]);
    expect(updated.every(({ status }) => status === 200)).toBe(true);
    expect((await call("GET", `/vehicles/${id}`, "admin-a")).json.data).toMatchObject({ license_plate: "แก้พร้อมกัน", vehicle_status: "maintenance" });
    const searched = await call("GET", "/vehicles?q=concurrent&vehicle_status=maintenance&limit=1&offset=0", "admin-a");
    expect(searched.json.data).toHaveLength(1);
    expect(searched.json.data[0].vehicle_id).toBe(id);
    expect((await call("GET", "/vehicles?q=CONCURRENT&limit=1&offset=1", "admin-a")).json.data).toEqual([]);
  });

  test("soft disabling a vehicle preserves its record, references and internal lookup contract", async () => {
    const disabled = await call("DELETE", `/vehicles/${vehicleA}`, "admin-a");
    expect(disabled.status).toBe(200);
    expect(disabled.json.data).toMatchObject({ vehicle_id: vehicleA, vehicle_status: "inactive", vehicle_type_id: typeA, current_driver_id: driverA });
    expect((await call("GET", `/vehicles/${vehicleA}`, "admin-a")).status).toBe(200);
    const internal = await app.handle(new Request(`http://localhost/internal/vehicles/${vehicleA}?company_id=${companyA}`, { headers: { "x-internal-token": process.env.INTERNAL_API_TOKEN! } }));
    expect(await internal.json()).toMatchObject({ success: true, data: { vehicle_id: vehicleA, company_id: companyA, vehicle_status: "inactive", current_driver_id: driverA } });
    expect((await call("PATCH", `/vehicles/${vehicleA}/status`, "admin-a", { vehicle_status: "active" })).json.data.vehicle_status).toBe("active");
  });

  test("audit records contain administrative changes and audit failure rolls back a vehicle edit", async () => {
    const logs = await prisma.systemLog.findMany({ where: { company_id: BigInt(companyA), entity_id: vehicleA }, orderBy: { system_log_id: "asc" } });
    expect(logs.some(({ action }) => action === "vehicle.create")).toBe(true);
    expect(logs.some(({ action }) => action === "vehicle.disable")).toBe(true);
    expect(JSON.stringify(logs.map(({ old_value, new_value }) => ({ old_value, new_value })))).not.toMatch(/password|token/i);
    const trigger = `vehicle_audit_${run}`;
    const before = (await call("GET", `/vehicles/${vehicleA}`, "admin-a")).json.data.license_plate;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON system_log FOR EACH ROW WHEN (NEW.entity_id='${vehicleA}' AND NEW.action='vehicle.update') EXECUTE FUNCTION ${trigger}()`);
    try {
      const failed = await call("PUT", `/vehicles/${vehicleA}`, "admin-a", { license_plate: "ต้องย้อนกลับ" });
      expect(failed.status).toBe(500);
      expect(failed.json.error.code).toBe("INTERNAL_ERROR");
      expect((await call("GET", `/vehicles/${vehicleA}`, "admin-a")).json.data.license_plate).toBe(before);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON system_log`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
  });
});
