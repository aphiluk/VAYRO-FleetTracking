// Runs the real gps-device-service code against its own database (gps_device_db).
// Other services are replaced by in-memory fakes through the adapter ports, so no other service has to be running.
// Needs DATABASE_URL (gps_device_db). Fixtures use unique ids per run and are kept.
import { beforeAll, describe, expect, test } from "bun:test";
import { ApiError, type Caller } from "@vayro/service-kit";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the gps_device_db connection string");
process.env.INTERNAL_API_TOKEN ??= "unit-test-internal-token-not-for-deployment-123456";
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); // test-only key
const { createDeviceApp } = await import("../src/app");
const { prisma } = await import("../src/lib/prisma");
const { connectionStatus, validateSettings } = await import("../src/domain/device");
const { decryptCredentials, encryptCredentials, keyFromEnv } = await import("../src/lib/crypto");
type VehicleInfo = import("../src/adapters/vehicle-directory").VehicleInfo;

const run = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 100)) * 10n; // unique per run
const companyA = String(run + 1n), companyB = String(run + 2n);
const vehicleA = String(run + 3n), vehicleB = String(run + 4n);

// ---- fakes for the services this one does not own ----
const vehicles = new Map<string, VehicleInfo>();
const vehicleDirectory = { getVehicle: async (company: string, id: string) => (vehicles.get(id)?.company_id === company ? vehicles.get(id)! : null) };
const caller = (token: string, role: Caller["role"], company: string | null, user: string): [string, Caller] =>
  [token, { role, company_id: company, user_id: user, full_name: token, email: `${token}@example.test`, phone: null, account_status: "active", workspace_status: "active" }];
const people = new Map<string, Caller>([
  caller("admin-a", "company_admin", companyA, String(run + 6n)),
  caller("admin-b", "company_admin", companyB, String(run + 7n)),
  caller("dispatcher", "dispatcher", companyA, String(run + 8n)),
  caller("driver", "driver", companyA, String(run + 5n)),
  caller("platform", "platform_admin", null, String(run + 9n)),
]);
// Same contract auth-service gives: unknown token -> 401.
const resolveUser = async (authorization?: string | null) => {
  const user = people.get(authorization?.match(/^Bearer (\S+)$/i)?.[1] ?? "");
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid access token");
  return user;
};

let app: ReturnType<typeof newApp>;
const newApp = (dir = vehicleDirectory) => createDeviceApp({ resolveUser, vehicles: dir }).compile();
async function call(method: string, path: string, token?: string, body?: object, headers: Record<string, string> = {}, target = app) {
  const response = await target.handle(new Request(`http://localhost${path}`, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }));
  return { status: response.status, json: await response.json() };
}
const internal = { "x-internal-token": process.env.INTERNAL_API_TOKEN! };
let deviceId: string;

beforeAll(() => {
  vehicles.set(vehicleA, { vehicle_id: vehicleA, company_id: companyA, vehicle_status: "active", current_driver_id: null });
  vehicles.set(vehicleB, { vehicle_id: vehicleB, company_id: companyB, vehicle_status: "active", current_driver_id: null });
  app = newApp();
});

describe("domain rules", () => {
  test("disabled devices are never connected; stale ones are disconnected", () => {
    const base = { connection_status: "connected" as const, last_received_at: new Date() };
    expect(connectionStatus({ ...base, connection_config: null })).toBe("connected");
    expect(connectionStatus({ ...base, connection_config: { disabled: true } })).toBe("disconnected");
    expect(connectionStatus({ ...base, last_received_at: new Date(Date.now() - 10 * 60_000), connection_config: null })).toBe("disconnected");
  });
  test("credentials are rejected in connection settings", () => {
    expect(() => validateSettings({ nested: { api_key: "x" } })).toThrow();
    expect(() => validateSettings({ disabled: "no" })).toThrow();
    expect(() => validateSettings({ endpoint: "https://example.test" })).not.toThrow();
  });
});

describe("GPS device administration", () => {
  test("health is public and missing/unknown tokens fail", async () => {
    expect((await call("GET", "/")).status).toBe(200);
    expect((await call("GET", "/api/v1/gps-devices")).status).toBe(401);
    expect((await call("GET", "/api/v1/gps-devices", "admin-a-tampered")).status).toBe(401);
  });
  test("registers a device on a real same-company vehicle, with BIGINT string IDs", async () => {
    const r = await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "gps-demo", source_type: "gps_device" });
    expect(r.status).toBe(201); expect(r.json.success).toBe(true);
    expect(r.json.data.company_id).toBe(companyA); expect(r.json.data.gps_device_id).toBeString();
    expect(r.json.data).not.toHaveProperty("credentials_encrypted");
    deviceId = r.json.data.gps_device_id;
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, "admin-b")).status).toBe(404);
    expect((await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleB, device_code: "wrong", source_type: "gps_device" })).status).toBe(404);
    expect((await call("POST", "/api/v1/gps-devices", "admin-b", { company_id: companyA, vehicle_id: vehicleA, device_code: "forged", source_type: "gps_device" })).status).toBe(403);
    expect((await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: Number(vehicleA), device_code: "numeric-id", source_type: "gps_device" })).status).toBe(422);
    expect((await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "gps-demo", source_type: "gps_device" })).status).toBe(409);
  });
  test("dispatcher reads but cannot write, driver cannot administer devices", async () => {
    expect((await call("GET", "/api/v1/gps-devices", "dispatcher")).status).toBe(200);
    expect((await call("DELETE", `/api/v1/gps-devices/${deviceId}`, "dispatcher")).status).toBe(403);
    expect((await call("GET", "/api/v1/gps-devices", "driver")).status).toBe(403);
  });
  test("device updates validate relationships and reject plaintext credential settings", async () => {
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, "admin-a", { vehicle_id: vehicleB })).status).toBe(404);
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, "admin-a", { connection_config: { api_key: "not-a-real-secret" } })).status).toBe(422);
    const updated = await call("PUT", `/api/v1/gps-devices/${deviceId}`, "admin-a", { provider_name: "Test provider", connection_config: { endpoint: "https://example.test" } });
    expect(updated.status).toBe(200); expect(updated.json.data.vehicle_id).toBe(vehicleA); expect(updated.json.data.provider_name).toBe("Test provider");
    const unused = await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "unused", source_type: "gps_device" });
    expect(unused.status).toBe(201);
    expect((await call("DELETE", `/api/v1/gps-devices/${unused.json.data.gps_device_id}`, "admin-a")).status).toBe(200);
    const closed = await call("GET", `/api/v1/gps-devices/${unused.json.data.gps_device_id}`, "admin-a");
    expect(closed.status).toBe(200); expect(closed.json.data.connection_config.disabled).toBe(true);
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, "admin-a", { connection_config: { disabled: "no" } })).status).toBe(422);
  });
  test("BIGINT company and vehicle IDs above 2^53 retain their exact values", async () => {
    const bigId = (9007199254740993n + BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000))).toString();
    vehicles.set(bigId, { vehicle_id: bigId, company_id: bigId, vehicle_status: "active", current_driver_id: null });
    const device = await call("POST", "/api/v1/gps-devices", "platform", { company_id: bigId, vehicle_id: bigId, device_code: "gps-big", source_type: "gps_device" });
    expect(device.status).toBe(201); expect(device.json.data.company_id).toBe(bigId); expect(device.json.data.vehicle_id).toBe(bigId);
  });
  test("an unavailable vehicle-service fails closed with 503 and stores nothing", async () => {
    const broken = newApp({ getVehicle: async () => { throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "down"); } });
    const r = await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "nope", source_type: "gps_device" }, {}, broken);
    expect(r.status).toBe(503);
    expect(await prisma.gpsDevice.count({ where: { company_id: BigInt(companyA), device_code: "nope" } })).toBe(0);
  });
  test("status endpoint reports a device that never reported as disconnected", async () => {
    const r = await call("GET", `/api/v1/gps-devices/${deviceId}/status`, "admin-a");
    expect(r.status).toBe(200); expect(r.json.data.connection_status).toBe("disconnected"); expect(r.json.data.last_received_at).toBeNull();
  });
});

describe("internal API for gps-data-service", () => {
  test("needs the internal token and never serves a user token", async () => {
    expect((await call("GET", `/internal/devices/by-code?company_id=${companyA}&device_code=gps-demo`)).status).toBe(401);
    expect((await call("GET", `/internal/devices/by-code?company_id=${companyA}&device_code=gps-demo`, "admin-a")).status).toBe(401);
  });
  test("looks a device up by company and code, and marks data as received", async () => {
    const found = await call("GET", `/internal/devices/by-code?company_id=${companyA}&device_code=gps-demo`, undefined, undefined, internal);
    expect(found.status).toBe(200);
    expect(found.json.data).toEqual({ gps_device_id: deviceId, company_id: companyA, vehicle_id: vehicleA, source_type: "gps_device", disabled: false });
    expect((await call("GET", `/internal/devices/by-code?company_id=${companyB}&device_code=gps-demo`, undefined, undefined, internal)).status).toBe(404);
    const at = new Date().toISOString();
    expect((await call("POST", `/internal/devices/${deviceId}/received`, undefined, { received_at: at }, internal)).status).toBe(200);
    const status = await call("GET", `/api/v1/gps-devices/${deviceId}/status`, "admin-a");
    expect(status.json.data.connection_status).toBe("connected"); expect(status.json.data.last_received_at).toBe(at);
  });
  test("device counts made by the database follow the same rules as the device list", async () => {
    const make = async (code: string, data: object) => {
      const r = await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: `${code}-${run}`, source_type: "gps_device" });
      expect(r.status).toBe(201);
      await prisma.gpsDevice.update({ where: { gps_device_id: BigInt(r.json.data.gps_device_id) }, data });
    };
    await make("st-error", { connection_status: "error", last_received_at: new Date() });
    await make("st-fresh", { connection_status: "connected", last_received_at: new Date() });
    await make("st-stale", { connection_status: "connected", last_received_at: new Date(Date.now() - 3_600_000) }); // stored "connected" but silent for an hour
    await make("st-off", { connection_status: "connected", last_received_at: new Date(), connection_config: { disabled: true } });
    const list = (await call("GET", "/api/v1/gps-devices?limit=500", "admin-a")).json.data as { connection_status: "connected" | "disconnected" | "error"; connection_config: { disabled?: boolean } | null }[];
    const expected = { connected: 0, disconnected: 0, error: 0 };
    for (const d of list) expected[d.connection_status]++;
    expect(expected.connected).toBeGreaterThan(0); expect(expected.disconnected).toBeGreaterThan(0); expect(expected.error).toBeGreaterThan(0);
    const stats = await call("GET", `/internal/stats/devices?company_id=${companyA}`, undefined, undefined, internal);
    expect(stats.status).toBe(200);
    expect(stats.json.data.by_connection_status).toEqual(expected);
    expect(stats.json.data.total).toBe(list.length);
    expect(stats.json.data.disabled).toBe(list.filter((d) => d.connection_config?.disabled === true).length);
    const platformWide = await call("GET", "/internal/stats/devices", undefined, undefined, internal);
    expect(platformWide.json.data.total).toBeGreaterThanOrEqual(list.length);
    expect((await call("GET", `/internal/stats/devices?company_id=${run + 99n}`, undefined, undefined, internal)).json.data.total).toBe(0); // another company's devices are not mixed in
  });
  test("DELETE disables ingestion persistently without deleting the device", async () => {
    expect((await call("DELETE", `/api/v1/gps-devices/${deviceId}`, "admin-a")).status).toBe(200);
    app = newApp();
    const found = await call("GET", `/internal/devices/by-code?company_id=${companyA}&device_code=gps-demo`, undefined, undefined, internal);
    expect(found.json.data.disabled).toBe(true);
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, "admin-a")).json.data.connection_status).toBe("disconnected");
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, "admin-a", { connection_config: { disabled: false } })).status).toBe(200);
    expect((await call("GET", `/internal/devices/by-code?company_id=${companyA}&device_code=gps-demo`, undefined, undefined, internal)).json.data.disabled).toBe(false);
  });

  test("only the owning admin can toggle ingestion without replacing other device settings", async () => {
    const created = await call("POST", "/api/v1/gps-devices", "admin-a", {
      vehicle_id: vehicleA, device_code: "phone-status-test", source_type: "driver_mobile_app",
      connection_config: { interval_seconds: 15 },
    });
    expect(created.status).toBe(201);
    const id = created.json.data.gps_device_id;
    const path = `/api/v1/gps-devices/${id}/status`;
    const receivedAt = new Date().toISOString();
    await call("POST", `/internal/devices/${id}/received`, undefined, { received_at: receivedAt }, internal);
    expect((await call("PATCH", path, "dispatcher", { enabled: false })).status).toBe(403);
    expect((await call("PATCH", path, "admin-b", { enabled: false })).status).toBe(404);
    expect((await call("PATCH", path, "admin-a", { enabled: "false" })).status).toBe(422);

    const disabled = await call("PATCH", path, "admin-a", { enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.json.data).toMatchObject({
      connection_config: { disabled: true, interval_seconds: 15 },
      connection_status: "disconnected", last_received_at: receivedAt,
    });
    const duplicate = await call("PATCH", path, "admin-a", { enabled: false });
    expect(duplicate.json.data.updated_at).toBe(disabled.json.data.updated_at);
    const enabled = await call("PATCH", path, "admin-a", { enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.json.data).toMatchObject({
      gps_device_id: id, connection_config: { disabled: false, interval_seconds: 15 }, last_received_at: receivedAt,
    });
  });
});

describe("encrypted provider credentials", () => {
  const secret = { username: "provider-user", password: "super-secret-value-123" };
  let id: string;
  const stored = async () => (await prisma.gpsDevice.findUnique({ where: { gps_device_id: BigInt(id) }, select: { credentials_encrypted: true } }))!.credentials_encrypted;

  test("crypto round trip; a wrong key or a changed text is rejected", () => {
    const key = keyFromEnv();
    const text = encryptCredentials(secret, key);
    expect(text.startsWith("v1:")).toBe(true); expect(text).not.toContain("super-secret");
    expect(decryptCredentials(text, key)).toEqual(secret);
    expect(encryptCredentials(secret, key)).not.toBe(text); // fresh IV every time
    expect(() => decryptCredentials(text, Buffer.alloc(32, 9))).toThrow();
    const parts = text.split(":"); parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptCredentials(parts.join(":"), key)).toThrow();
    expect(() => keyFromEnv("c2hvcnQ=")).toThrow(); // not 32 bytes
  });
  test("saved encrypted, never returned, flagged with has_credentials", async () => {
    const r = await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "provider-1", source_type: "provider_api", provider_name: "Acme GPS", credentials: secret });
    expect(r.status).toBe(201); expect(r.json.data.has_credentials).toBe(true);
    id = r.json.data.gps_device_id;
    expect(JSON.stringify(r.json)).not.toContain("super-secret"); expect(r.json.data).not.toHaveProperty("credentials"); expect(r.json.data).not.toHaveProperty("credentials_encrypted");
    const text = await stored();
    expect(text).toStartWith("v1:"); expect(text).not.toContain("super-secret");
    expect(decryptCredentials(text!, keyFromEnv())).toEqual(secret);
    for (const path of [`/api/v1/gps-devices/${id}`, "/api/v1/gps-devices"]) {
      const g = await call("GET", path, "admin-a");
      expect(JSON.stringify(g.json)).not.toContain("super-secret"); expect(JSON.stringify(g.json)).not.toContain("v1:");
    }
    const logs = await prisma.systemLog.findMany({ where: { entity_id: id } });
    expect(JSON.stringify(logs)).not.toContain("super-secret"); expect(logs.length).toBeGreaterThan(0);
  });
  test("update keeps, replaces or removes them; a device without any reports false", async () => {
    const before = await stored();
    expect((await call("PUT", `/api/v1/gps-devices/${id}`, "admin-a", { provider_name: "Acme GPS 2" })).json.data.has_credentials).toBe(true);
    expect(await stored()).toBe(before);
    expect((await call("PUT", `/api/v1/gps-devices/${id}`, "admin-a", { credentials: { token_value: "new-secret-xyz" } })).status).toBe(200);
    expect(await stored()).not.toBe(before);
    expect(decryptCredentials((await stored())!, keyFromEnv())).toEqual({ token_value: "new-secret-xyz" });
    const cleared = await call("PUT", `/api/v1/gps-devices/${id}`, "admin-a", { credentials: null });
    expect(cleared.json.data.has_credentials).toBe(false); expect(await stored()).toBeNull();
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, "admin-a")).json.data.has_credentials).toBe(false);
  });
  test("only administrators may set them, and an oversized or unconfigured request stores nothing", async () => {
    expect((await call("PUT", `/api/v1/gps-devices/${id}`, "dispatcher", { credentials: secret })).status).toBe(403);
    expect((await call("PUT", `/api/v1/gps-devices/${id}`, "admin-b", { credentials: secret })).status).toBe(404);
    expect((await call("PUT", `/api/v1/gps-devices/${id}`, "admin-a", { credentials: { blob: "x".repeat(5000) } })).status).toBe(422);
    const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    try {
      const r = await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "no-key", source_type: "provider_api", credentials: secret });
      expect(r.status).toBe(503); expect(r.json.error.code).toBe("CREDENTIALS_NOT_CONFIGURED");
      expect(await prisma.gpsDevice.count({ where: { company_id: BigInt(companyA), device_code: "no-key" } })).toBe(0);
      expect((await call("POST", "/api/v1/gps-devices", "admin-a", { vehicle_id: vehicleA, device_code: "no-key-no-creds", source_type: "gps_device" })).status).toBe(201);
    } finally { process.env.CREDENTIALS_ENCRYPTION_KEY = key; }
  });
});
