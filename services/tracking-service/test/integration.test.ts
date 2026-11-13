import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "../../auth-service/src/db";
import { hashPassword } from "../../auth-service/src/security";
import { createTrackingApp, parseTokenConfig } from "../src/index";

const suffix = crypto.randomUUID();
const password = `TestOnly-${suffix}`;
const deviceToken = `test-device-only-${suffix}`;
let companyA: string, companyB: string, vehicleA: string, vehicleB: string, adminId: string, driverId: string;
let adminA: string, adminB: string, dispatcher: string, driver: string, platform: string, deviceId: string;
let app: ReturnType<typeof createTrackingApp>;
const AUTH_URL = process.env.AUTH_SERVICE_URL ?? "http://auth-service:3000";

async function login(email: string) {
  const response = await fetch(`${AUTH_URL}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function call(method: string, path: string, token?: string, body?: object) {
  const response = await app.handle(new Request(`http://localhost${path}`, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  return { status: response.status, json: await response.json() };
}
function newApp() {
  return createTrackingApp({ tokens: parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "gps_device", company_id: companyA, device_code: "gps-demo" } })) }).compile();
}
beforeAll(async () => {
  const [a] = await sql`INSERT INTO company(company_name, workspace_status) VALUES ('GPS database test A', 'active') RETURNING company_id`;
  const [b] = await sql`INSERT INTO company(company_name, workspace_status) VALUES ('GPS database test B', 'active') RETURNING company_id`;
  companyA = a.company_id; companyB = b.company_id;
  const hash = await hashPassword(password);
  for (const [label, role, company] of [["a", "company_admin", companyA], ["b", "company_admin", companyB], ["dispatch", "dispatcher", companyA], ["driver", "driver", companyA]]) {
    await sql`INSERT INTO users(company_id, full_name, email, password_hash, role) VALUES (${company}, ${label}, ${`${label}-${suffix}@example.test`}, ${hash}, ${role})`;
  }
  const adminSession = await login(`a-${suffix}@example.test`);
  adminA = adminSession.access_token; adminId = adminSession.user.user_id;
  adminB = (await login(`b-${suffix}@example.test`)).access_token;
  dispatcher = (await login(`dispatch-${suffix}@example.test`)).access_token;
  const driverSession = await login(`driver-${suffix}@example.test`);
  driver = driverSession.access_token; driverId = driverSession.user.user_id;
  await sql`INSERT INTO users(full_name,email,password_hash,role) VALUES ('GPS Test Platform',${`platform-${suffix}@example.test`},${hash},'platform_admin')`;
  platform = (await login(`platform-${suffix}@example.test`)).access_token;
  const [va] = await sql`INSERT INTO vehicles(company_id,vehicle_code,license_plate,current_driver_id) VALUES (${companyA},'VA','TEST-A',${driverId}) RETURNING vehicle_id`;
  const [vb] = await sql`INSERT INTO vehicles(company_id,vehicle_code,license_plate) VALUES (${companyB},'VB','TEST-B') RETURNING vehicle_id`;
  vehicleA = va.vehicle_id; vehicleB = vb.vehicle_id;
  app = newApp();
});

describe("GPS persistence and canonical Data Dictionary contract", () => {
  test("health is public and missing/tampered JWTs fail", async () => {
    expect((await call("GET", "/")).status).toBe(200);
    expect((await call("GET", "/api/v1/gps-devices")).status).toBe(401);
    expect((await call("GET", "/api/v1/gps-devices", adminA + "tampered")).status).toBe(401);
  });
  test("credential config rejects static admins and legacy numeric company IDs", () => {
    expect(() => parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "company_admin", company_id: companyA } }))).toThrow();
    expect(() => parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "gps_device", companyId: Number(companyA), deviceIdentifier: "gps-demo" } }))).toThrow();
  });
  test("JWT registers a device on a real same-company vehicle, with BIGINT string IDs", async () => {
    const r = await call("POST", "/api/v1/gps-devices", adminA, { vehicle_id: vehicleA, device_code: "gps-demo", source_type: "gps_device" });
    expect(r.status).toBe(201); expect(r.json.success).toBe(true);
    expect(r.json.data.company_id).toBe(companyA); expect(r.json.data.gps_device_id).toBeString();
    expect(r.json.data).not.toHaveProperty("credentials_encrypted");
    deviceId = r.json.data.gps_device_id;
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, adminB)).status).toBe(404);
    expect((await call("POST", "/api/v1/gps-devices", adminA, { vehicle_id: vehicleB, device_code: "wrong", source_type: "gps_device" })).status).toBe(404);
    expect((await call("POST", "/api/v1/gps-devices", adminB, { company_id: companyA, vehicle_id: vehicleA, device_code: "forged", source_type: "gps_device" })).status).toBe(403);
    expect((await call("POST", "/api/v1/gps-devices", adminA, { vehicle_id: Number(vehicleA), device_code: "numeric-id", source_type: "gps_device" })).status).toBe(422);
  });
  test("dispatcher reads but cannot write, driver cannot administer devices", async () => {
    expect((await call("GET", "/api/v1/gps-devices", dispatcher)).status).toBe(200);
    expect((await call("DELETE", `/api/v1/gps-devices/${deviceId}`, dispatcher)).status).toBe(403);
    expect((await call("GET", "/api/v1/gps-devices", driver)).status).toBe(403);
  });
  test("device updates validate relationships and reject plaintext credential settings", async () => {
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, adminA, { vehicle_id: vehicleB })).status).toBe(404);
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, adminA, { connection_config: { api_key: "not-a-real-secret" } })).status).toBe(422);
    const updated = await call("PUT", `/api/v1/gps-devices/${deviceId}`, adminA, { provider_name: "Test provider", connection_config: { endpoint: "https://example.test" } });
    expect(updated.status).toBe(200); expect(updated.json.data.vehicle_id).toBe(vehicleA);
    const unused = await call("POST", "/api/v1/gps-devices", adminA, { vehicle_id: vehicleA, device_code: "unused", source_type: "gps_device" });
    expect(unused.status).toBe(201);
    expect((await call("DELETE", `/api/v1/gps-devices/${unused.json.data.gps_device_id}`, adminA)).status).toBe(200);
    const closed = await call("GET", `/api/v1/gps-devices/${unused.json.data.gps_device_id}`, adminA);
    expect(closed.status).toBe(200); expect(closed.json.data.connection_config.disabled).toBe(true);
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, adminA, { connection_config: { disabled: "no" } })).status).toBe(422);
  });
  test("BIGINT company and vehicle IDs above 2^53 retain their exact values", async () => {
    const bigId = (9007199254740993n + BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000))).toString();
    await sql`INSERT INTO company(company_id,company_name,workspace_status) OVERRIDING SYSTEM VALUE VALUES (${bigId},'BIGINT test company','active')`;
    await sql`INSERT INTO vehicles(vehicle_id,company_id,vehicle_code,license_plate) OVERRIDING SYSTEM VALUE VALUES (${bigId},${bigId},'BIGINT-test','TEST-BIGINT')`;
    const device = await call("POST", "/api/v1/gps-devices", platform, { company_id: bigId, vehicle_id: bigId, device_code: "gps-big", source_type: "gps_device" });
    expect(device.status).toBe(201); expect(device.json.data.company_id).toBe(bigId); expect(device.json.data.vehicle_id).toBe(bigId);
    const bigApp = createTrackingApp({ tokens: parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "gps_device", company_id: bigId, device_code: "gps-big" } })) }).compile();
    const response = await bigApp.handle(new Request("http://localhost/api/v1/gps/ingest", { method: "POST", headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" }, body: JSON.stringify({ device_code: "gps-big", recorded_at: new Date().toISOString(), latitude: 13.7, longitude: 100.5 }) }));
    expect(response.status).toBe(201); expect((await response.json()).data.company_id).toBe(bigId);
  });
  test("canonical positions persist and concurrent duplicates produce one row", async () => {
    const point = { device_code: "gps-demo", external_record_id: "point-1", recorded_at: new Date().toISOString(), latitude: 13.75, longitude: 100.5, speed_kmh: 35.12, direction_degree: 359, accuracy_meters: 8.5 };
    const r = await call("POST", "/api/v1/gps/ingest", deviceToken, point);
    expect(r.status).toBe(201);
    expect(r.json.data.gps_location_id).toBeString(); expect(r.json.data.speed_kmh).toBe(35.12);
    expect(r.json.data.accuracy_meters).toBe(8.5); expect(r.json.data.received_at).toBeString();
    expect(r.json.data).not.toHaveProperty("speed_kph"); expect(r.json.data).not.toHaveProperty("id");
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, point)).status).toBe(409);
    const concurrent = await Promise.all([1, 2].map(() => call("POST", "/api/v1/gps/ingest", deviceToken, { ...point, external_record_id: "concurrent" })));
    expect(concurrent.map(x => x.status).sort()).toEqual([201,409]);
    const [count] = await sql`SELECT count(*)::int AS n FROM gps_locations WHERE gps_device_id=${deviceId} AND external_record_id='concurrent'`;
    expect(count.n).toBe(1);
    for (const bad of [{ ...point, latitude: 91 }, { ...point, direction_degree: 360 }, { ...point, speed_kph: 20 }, { ...point, company_id: companyB }, { ...point, external_record_id: "x".repeat(101) }]) {
      expect((await call("POST", "/api/v1/gps/ingest", deviceToken, bad)).status).toBe(422);
    }
    expect((await call("POST", "/api/v1/gps/ingest", adminA, point)).status).toBe(403);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, adminB)).status).toBe(404);
  });
  test("new app instance reads stored data; late points never replace latest", async () => {
    const before = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, adminA);
    app = newApp();
    const after = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, adminA);
    expect(after.status).toBe(200); expect(after.json.data.gps_location_id).toBe(before.json.data.gps_location_id);
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, adminA)).status).toBe(200);
    const delayed = await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", external_record_id: "delayed", recorded_at: new Date(Date.now() - 600000).toISOString(), latitude: 13.7, longitude: 100.4 });
    expect(delayed.json.data.freshness).toBe("delayed");
    const latest = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, adminA);
    expect(latest.json.data.gps_location_id).toBe(before.json.data.gps_location_id);
    const history = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/locations`, adminA);
    expect(history.status).toBe(200); expect(history.json.data.length).toBe(3);
    expect(history.json.data[0].external_record_id).toBe("delayed");
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/locations?limit=501`, adminA)).status).toBe(422);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/locations?from=2020-01-01T00:00:00Z&to=2021-01-01T00:00:00Z`, adminA)).status).toBe(422);
  });
  test("driver mobile requires the assigned vehicle and an in-progress job", async () => {
    expect((await call("POST", "/api/v1/gps-devices", adminA, { vehicle_id: vehicleA, device_code: "phone-demo", source_type: "driver_mobile_app" })).status).toBe(201);
    const point = { device_code: "phone-demo", external_record_id: "phone-1", recorded_at: new Date().toISOString(), latitude: 13.75, longitude: 100.5 };
    expect((await call("POST", "/api/v1/gps/ingest", driver, point)).status).toBe(403);
    const [job] = await sql`INSERT INTO transport_jobs(company_id,job_code,pickup_address,delivery_address,vehicle_id,driver_id,job_status,created_by)
      VALUES (${companyA},'GPS-mobile-test','pickup','delivery',${vehicleA},${driverId},'in_progress',${adminId}) RETURNING job_id`;
    expect((await call("POST", "/api/v1/gps/ingest", driver, point)).status).toBe(201);
    await sql`UPDATE transport_jobs SET job_status='completed' WHERE job_id=${job.job_id}`;
    expect((await call("POST", "/api/v1/gps/ingest", driver, { ...point, external_record_id: "phone-2" })).status).toBe(403);
  });
  test("suspended workspace blocks human JWT and device credentials", async () => {
    await sql`UPDATE company SET workspace_status='suspended' WHERE company_id=${companyA}`;
    try {
      expect((await call("GET", "/api/v1/gps-devices", adminA)).status).toBe(403);
      expect((await call("GET", "/api/v1/gps-devices", deviceToken)).status).toBe(403);
    } finally { await sql`UPDATE company SET workspace_status='active' WHERE company_id=${companyA}`; }
  });
  test("referenced driver cannot be moved out of the company; User API returns 409", async () => {
    const r = await fetch(`http://gateway:3000/api/v1/users/${driverId}/role`, { method: "PATCH", headers: { authorization: `Bearer ${platform}`, "content-type": "application/json" }, body: JSON.stringify({ role: "platform_admin" }) });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("CONFLICT");
    const [user] = await sql`SELECT company_id, role FROM users WHERE user_id=${driverId}`;
    expect(user.company_id).toBe(companyA); expect(user.role).toBe("driver");
  });
  test("logout revokes GPS access immediately", async () => {
    const session = await login(`a-${suffix}@example.test`);
    expect((await call("GET", "/api/v1/gps-devices", session.access_token)).status).toBe(200);
    await fetch(`${AUTH_URL}/api/v1/auth/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    expect((await call("GET", "/api/v1/gps-devices", session.access_token)).status).toBe(401);
  });
  test("live gateway reads the same persisted database data", async () => {
    const r = await fetch(`http://gateway:3000/api/v1/gps/vehicles/${vehicleA}/latest`, { headers: { authorization: `Bearer ${adminA}` } });
    expect(r.status).toBe(200); expect((await r.json()).data.gps_location_id).toBeString();
    expect((await fetch("http://gateway:3000/api/v1/gps-fake")).status).toBe(404);
  });
  test("DELETE disables ingestion persistently without deleting devices or history", async () => {
    const [before] = await sql`SELECT count(*)::int AS n FROM gps_locations WHERE gps_device_id=${deviceId}`;
    const closed = await call("DELETE", `/api/v1/gps-devices/${deviceId}`, adminA);
    expect(closed.status).toBe(200); expect(closed.json.data.connection_status).toBe("disconnected");
    app = newApp();
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", recorded_at: new Date().toISOString(), latitude: 13.7, longitude: 100.5 })).status).toBe(403);
    const [after] = await sql`SELECT count(*)::int AS n FROM gps_locations WHERE gps_device_id=${deviceId}`;
    expect(after.n).toBe(before.n);
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, adminA)).status).toBe(200);
    expect((await call("PUT", `/api/v1/gps-devices/${deviceId}`, adminA, { connection_config: { disabled: false } })).status).toBe(200);
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", recorded_at: new Date().toISOString(), latitude: 13.7, longitude: 100.5 })).status).toBe(201);
  });
});
