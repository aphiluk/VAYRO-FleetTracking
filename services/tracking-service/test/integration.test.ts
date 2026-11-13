import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "../../auth-service/src/db";
import { hashPassword } from "../../auth-service/src/security";
import { createTrackingApp, parseTokenConfig } from "../src/index";

const suffix = crypto.randomUUID();
const password = `TestOnly-${suffix}`;
const deviceToken = `test-device-only-${suffix}`;
let companyA: string, companyB: string;
let adminA: string, adminB: string, dispatcher: string, driver: string;
let app: ReturnType<typeof createTrackingApp>;
let deviceId: number;
const AUTH_URL = process.env.AUTH_SERVICE_URL ?? "http://auth-service:3000";

async function login(email: string) {
  const response = await fetch(`${AUTH_URL}/api/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
async function call(method: string, path: string, token?: string, body?: object) {
  const response = await app.handle(new Request(`http://localhost${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: response.status, json: await response.json() };
}
beforeAll(async () => {
  const [a] = await sql`INSERT INTO company(company_name, workspace_status) VALUES ('GPS integration A', 'active') RETURNING company_id`;
  const [b] = await sql`INSERT INTO company(company_name, workspace_status) VALUES ('GPS integration B', 'active') RETURNING company_id`;
  companyA = a.company_id; companyB = b.company_id;
  const hash = await hashPassword(password);
  for (const [label, role, company] of [["a", "company_admin", companyA], ["b", "company_admin", companyB], ["dispatch", "dispatcher", companyA], ["driver", "driver", companyA]]) {
    await sql`INSERT INTO users(company_id, full_name, email, password_hash, role) VALUES (${company}, ${label}, ${`${label}-${suffix}@example.test`}, ${hash}, ${role})`;
  }
  adminA = (await login(`a-${suffix}@example.test`)).access_token;
  adminB = (await login(`b-${suffix}@example.test`)).access_token;
  dispatcher = (await login(`dispatch-${suffix}@example.test`)).access_token;
  driver = (await login(`driver-${suffix}@example.test`)).access_token;
  app = createTrackingApp({ tokens: parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "gps_device", companyId: Number(companyA), deviceIdentifier: "gps-demo" } })) }).compile();
});

describe("GPS integration with Authentication and User", () => {
  test("health is public; protected routes require a valid credential", async () => {
    expect((await call("GET", "/")).status).toBe(200);
    expect((await call("GET", "/api/v1/gps-devices")).status).toBe(401);
    expect((await call("GET", "/api/v1/gps-devices", adminA + "tampered")).status).toBe(401);
  });
  test("static config cannot grant user or admin privileges", () => {
    expect(() => createTrackingApp({ tokens: new Map([["test-admin-token-not-valid", { role: "company_admin", companyId: Number(companyA) }]]) })).toThrow("device credentials only");
  });
  test("real Login JWT creates an isolated GPS device", async () => {
    const r = await call("POST", "/api/v1/gps-devices", adminA, { vehicle_id: 1, device_code: "gps-demo", source_type: "gps_device" });
    expect(r.status).toBe(201);
    expect(r.json.success).toBe(true);
    expect(r.json.request_id).toBeString();
    deviceId = r.json.data.gps_device_id;
    expect((await call("GET", `/api/v1/gps-devices/${deviceId}`, adminB)).status).toBe(404);
    expect((await call("GET", "/api/v1/gps-devices", adminB)).json.data).toEqual([]);
    expect((await call("POST", "/api/v1/gps-devices", adminB, { company_id: Number(companyA), vehicle_id: 1, device_code: "forged", source_type: "gps_device" })).status).toBe(403);
  });
  test("dispatcher reads but cannot write; driver has no device-management access", async () => {
    expect((await call("GET", "/api/v1/gps-devices", dispatcher)).status).toBe(200);
    expect((await call("DELETE", `/api/v1/gps-devices/${deviceId}`, dispatcher)).status).toBe(403);
    expect((await call("GET", "/api/v1/gps-devices", driver)).status).toBe(403);
  });
  test("device credential ingests positions but cannot act as a user", async () => {
    const point = { device_code: "gps-demo", external_record_id: "point-1", recorded_at: new Date().toISOString(), latitude: 13.75, longitude: 100.5 };
    const r = await call("POST", "/api/v1/gps/ingest", deviceToken, point);
    expect(r.status).toBe(201);
    expect(r.json.data.received_at).toBeString();
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, point)).status).toBe(409);
    expect((await call("POST", "/api/v1/gps/ingest", adminA, point)).status).toBe(403);
    expect((await call("GET", "/api/v1/gps-devices", deviceToken)).status).toBe(403);
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { ...point, latitude: 91 })).status).toBe(422);
    expect((await call("GET", "/api/v1/gps/vehicles/1/latest", adminB)).status).toBe(404);
    expect((await call("GET", "/api/v1/gps/vehicles/1/latest", adminA)).json.data.freshness).toBe("current");
  });
  test("suspended workspace blocks both human JWT and device credential", async () => {
    await sql`UPDATE company SET workspace_status='suspended' WHERE company_id=${companyA}`;
    try {
      expect((await call("GET", "/api/v1/gps-devices", adminA)).status).toBe(403);
      expect((await call("GET", "/api/v1/gps-devices", deviceToken)).status).toBe(403);
    } finally { await sql`UPDATE company SET workspace_status='active' WHERE company_id=${companyA}`; }
  });
  test("logout revokes access to GPS immediately", async () => {
    const session = await login(`a-${suffix}@example.test`);
    expect((await call("GET", "/api/v1/gps-devices", session.access_token)).status).toBe(200);
    await fetch(`${AUTH_URL}/api/v1/auth/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    expect((await call("GET", "/api/v1/gps-devices", session.access_token)).status).toBe(401);
  });
  test("gateway forwards GPS with JWT and keeps unrelated prefixes blocked", async () => {
    const headers = { authorization: `Bearer ${adminA}` };
    const r = await fetch("http://gateway:3000/api/v1/gps-devices", { headers });
    expect(r.status).toBe(200);
    expect((await r.json()).success).toBe(true);
    expect((await fetch("http://gateway:3000/api/v1/gps-fake", { headers })).status).toBe(404);
  });
});
