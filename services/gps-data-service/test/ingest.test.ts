// Runs the real gps-data-service code against its own database (gps_data_db).
// Other services are replaced by in-memory fakes through the adapter ports, so no other service has to be running.
// Needs DATABASE_URL (gps_data_db). Fixtures use unique ids per run and are kept.
import { beforeAll, describe, expect, test } from "bun:test";
import { ApiError, type Caller } from "@vayro/service-kit";
import { createGateway } from "../../../gateway/src/app";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the gps_data_db connection string");
process.env.INTERNAL_API_TOKEN ??= "unit-test-internal-token-not-for-deployment-123456";
const { createGpsDataApp, parseTokenConfig } = await import("../src/app");
const { prisma } = await import("../src/lib/prisma");
const { freshness, anomaliesOf, findGaps, distanceKm } = await import("../src/domain/gps");
const { httpEventPublisher } = await import("../src/adapters/event-publisher");
type VehicleInfo = import("../src/adapters/fleet-directory").VehicleInfo;
type DeviceInfo = import("../src/adapters/device-directory").DeviceInfo;

const run = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 100)) * 10n; // unique per run
const companyA = String(run + 1n), companyB = String(run + 2n);
const vehicleA = String(run + 3n), vehicleB = String(run + 4n);
const driverId = String(run + 5n);
const deviceA = String(run + 20n), phoneA = String(run + 21n);
const vehicleQ = String(run + 30n), deviceQ = String(run + 31n);
const deviceToken = `test-device-only-${crypto.randomUUID()}`;

// ---- fakes for the services this one does not own ----
const workspace = new Map<string, string>([[companyA, "active"], [companyB, "active"]]);
const vehicles = new Map<string, VehicleInfo>();
const activeJobs = new Set<string>();
const fleet = {
  getVehicle: async (company: string | null, id: string) => {
    const v = vehicles.get(id);
    return v && (company === null || v.company_id === company) ? v : null;
  },
  workspaceStatus: async (company: string) => workspace.get(company) ?? null,
  hasActiveJob: async (company: string, vehicle: string, driver: string) => activeJobs.has(`${company}:${vehicle}:${driver}`),
};
const devices = new Map<string, DeviceInfo>(); // key: company:code
const received: string[] = [];
let failReceived = false;
const published: any[] = []; // what the event publisher was asked to send
const events = { locationStored: (location: unknown) => { published.push(location); } };
const deviceDirectory = {
  byCode: async (company: string, code: string) => devices.get(`${company}:${code}`) ?? null,
  markReceived: async (id: string) => { if (failReceived) throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "down"); received.push(id); },
};
const caller = (token: string, role: Caller["role"], company: string | null, user: string): [string, Caller] =>
  [token, { role, company_id: company, user_id: user, full_name: token, email: `${token}@example.test`, phone: null, account_status: "active", workspace_status: "active" }];
const people = new Map<string, Caller>([
  caller("admin-a", "company_admin", companyA, String(run + 6n)),
  caller("admin-b", "company_admin", companyB, String(run + 7n)),
  caller("dispatcher", "dispatcher", companyA, String(run + 8n)),
  caller("driver", "driver", companyA, driverId),
  caller("platform", "platform_admin", null, String(run + 9n)),
]);
// Same contract auth-service gives: unknown token -> 401, inactive workspace -> 403.
const resolveUser = async (authorization?: string | null) => {
  const user = people.get(authorization?.match(/^Bearer (\S+)$/i)?.[1] ?? "");
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid access token");
  if (user.company_id && workspace.get(user.company_id) !== "active") throw new ApiError(403, "WORKSPACE_NOT_ACTIVE", "This company workspace is not active");
  return user;
};

function newApp(company = companyA, code = "gps-demo", fleetImpl = fleet) {
  return createGpsDataApp({ tokens: parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "gps_device", company_id: company, device_code: code } })), resolveUser, fleet: fleetImpl, devices: deviceDirectory, events }).compile();
}
let app = newApp();
async function call(method: string, path: string, token?: string, body?: object, target: Pick<typeof app, "handle"> = app, headers: Record<string, string> = {}) {
  const response = await target.handle(new Request(`http://localhost${path}`, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }));
  return { status: response.status, json: await response.json() };
}
const internal = { "x-internal-token": process.env.INTERNAL_API_TOKEN! };
const at = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

beforeAll(() => {
  vehicles.set(vehicleA, { vehicle_id: vehicleA, company_id: companyA, vehicle_status: "active", current_driver_id: driverId });
  vehicles.set(vehicleB, { vehicle_id: vehicleB, company_id: companyB, vehicle_status: "active", current_driver_id: null });
  vehicles.set(vehicleQ, { vehicle_id: vehicleQ, company_id: companyA, vehicle_status: "active", current_driver_id: null });
  devices.set(`${companyA}:q-dev`, { gps_device_id: deviceQ, company_id: companyA, vehicle_id: vehicleQ, source_type: "gps_device", disabled: false });
  devices.set(`${companyA}:gps-demo`, { gps_device_id: deviceA, company_id: companyA, vehicle_id: vehicleA, source_type: "gps_device", disabled: false });
  devices.set(`${companyA}:phone-demo`, { gps_device_id: phoneA, company_id: companyA, vehicle_id: vehicleA, source_type: "driver_mobile_app", disabled: false });
});

describe("domain rules", () => {
  test("freshness flags old points and clocks far in the future", () => {
    expect(freshness(new Date())).toBe("current");
    expect(freshness(new Date(Date.now() - 10 * 60_000))).toBe("delayed");
    expect(freshness(new Date(Date.now() + 60_000))).toBe("delayed");
  });
});

describe("abnormal and missing data rules", () => {
  const bangkok = { latitude: 13.7563, longitude: 100.5018 }, chiangMai = { latitude: 18.7883, longitude: 98.9853 };
  const t0 = new Date("2026-01-01T00:00:00Z");
  const min = (m: number) => new Date(t0.getTime() + m * 60_000);
  test("distance between two cities is about right", () => {
    expect(distanceKm(bangkok, chiangMai)).toBeGreaterThan(570); expect(distanceKm(bangkok, chiangMai)).toBeLessThan(600);
    expect(distanceKm(bangkok, bangkok)).toBe(0);
  });
  test("flags (0,0) and a move no road vehicle can make, but not a normal one", () => {
    expect(anomaliesOf({ ...bangkok, recordedAt: min(0) })).toEqual([]);
    expect(anomaliesOf({ latitude: 0, longitude: 0, recordedAt: min(0) })).toEqual(["null_island"]);
    expect(anomaliesOf({ latitude: 13.76, longitude: 100.51, recordedAt: min(10) }, { ...bangkok, recordedAt: min(0) })).toEqual([]);
    expect(anomaliesOf({ ...chiangMai, recordedAt: min(1) }, { ...bangkok, recordedAt: min(0) })).toEqual(["impossible_speed"]);
    expect(anomaliesOf({ ...chiangMai, recordedAt: min(600) }, { ...bangkok, recordedAt: min(0) })).toEqual([]); // 10 h for 583 km is fine
    expect(anomaliesOf({ ...chiangMai, recordedAt: min(0) }, { ...bangkok, recordedAt: min(0) })).toEqual([]); // same instant: no speed
  });
  test("finds gaps longer than ten minutes and ignores shorter ones", () => {
    expect(findGaps([min(0), min(5), min(15)])).toEqual([]); // exactly 10 minutes is not a gap
    expect(findGaps([min(0), min(5), min(36), min(40)])).toEqual([{ from: min(5).toISOString(), to: min(36).toISOString(), minutes: 31 }]);
    expect(findGaps([])).toEqual([]);
  });
});

describe("GPS ingest and stored positions", () => {
  test("health is public; ingest and reads need credentials", async () => {
    expect((await call("GET", "/")).status).toBe(200);
    expect((await call("POST", "/api/v1/gps/ingest", undefined, { device_code: "gps-demo", recorded_at: at(), latitude: 1, longitude: 1 })).status).toBe(401);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "admin-a-tampered")).status).toBe(401);
  });
  test("credential config rejects static admins and legacy numeric company IDs", () => {
    expect(() => parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "company_admin", company_id: companyA } }))).toThrow();
    expect(() => parseTokenConfig(JSON.stringify({ [deviceToken]: { role: "gps_device", companyId: Number(companyA), deviceIdentifier: "gps-demo" } }))).toThrow();
  });
  test("canonical positions persist, mark the device as received, and concurrent duplicates produce one row", async () => {
    const point = { device_code: "gps-demo", external_record_id: "point-1", recorded_at: at(), latitude: 13.75, longitude: 100.5, speed_kmh: 35.12, direction_degree: 359, accuracy_meters: 8.5 };
    const r = await call("POST", "/api/v1/gps/ingest", deviceToken, point);
    expect(r.status).toBe(201);
    expect(r.json.data.gps_location_id).toBeString(); expect(r.json.data.speed_kmh).toBe(35.12);
    expect(r.json.data.latitude).toBe(13.75); expect(r.json.data.accuracy_meters).toBe(8.5); expect(r.json.data.received_at).toBeString();
    expect(r.json.data.gps_device_id).toBe(deviceA); expect(r.json.data.vehicle_id).toBe(vehicleA);
    expect(r.json.data).not.toHaveProperty("speed_kph"); expect(r.json.data).not.toHaveProperty("id");
    expect(received).toContain(deviceA);
    const again = await call("POST", "/api/v1/gps/ingest", deviceToken, point);
    expect(again.status).toBe(409); expect(again.json.error.code).toBe("DUPLICATE_RECORD");
    const concurrent = await Promise.all([1, 2].map(() => call("POST", "/api/v1/gps/ingest", deviceToken, { ...point, external_record_id: "concurrent" })));
    expect(concurrent.map(x => x.status).sort()).toEqual([201, 409]);
    expect(await prisma.gpsLocation.count({ where: { gps_device_id: BigInt(deviceA), external_record_id: "concurrent" } })).toBe(1);
    for (const bad of [{ ...point, latitude: 91 }, { ...point, direction_degree: 360 }, { ...point, speed_kph: 20 }, { ...point, company_id: companyB }, { ...point, external_record_id: "x".repeat(101) }]) {
      expect((await call("POST", "/api/v1/gps/ingest", deviceToken, bad)).status).toBe(422);
    }
    expect((await call("POST", "/api/v1/gps/ingest", "admin-a", point)).status).toBe(403);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "admin-b")).status).toBe(404);
  });
  test("a failed device-status update never turns a stored point into an error", async () => {
    failReceived = true;
    try {
      const r = await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", external_record_id: "status-down", recorded_at: at(-1000), latitude: 13.7, longitude: 100.5 });
      expect(r.status).toBe(201);
    } finally { failReceived = false; }
  });
  test("unknown or disabled devices are refused", async () => {
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo-other", recorded_at: at(), latitude: 1, longitude: 1 })).status).toBe(403);
    const other = newApp(companyA, "ghost");
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "ghost", recorded_at: at(), latitude: 1, longitude: 1 }, other)).status).toBe(403);
    devices.set(`${companyA}:gps-demo`, { ...devices.get(`${companyA}:gps-demo`)!, disabled: true });
    try {
      expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", recorded_at: at(), latitude: 1, longitude: 1 })).status).toBe(403);
    } finally { devices.set(`${companyA}:gps-demo`, { ...devices.get(`${companyA}:gps-demo`)!, disabled: false }); }
  });
  test("new app instance reads stored data; late points never replace latest", async () => {
    const before = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "admin-a");
    app = newApp();
    const after = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "admin-a");
    expect(after.status).toBe(200); expect(after.json.data.gps_location_id).toBe(before.json.data.gps_location_id);
    const delayed = await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", external_record_id: "delayed", recorded_at: at(-600000), latitude: 13.7, longitude: 100.4 });
    expect(delayed.json.data.freshness).toBe("delayed");
    const latest = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "admin-a");
    expect(latest.json.data.gps_location_id).toBe(before.json.data.gps_location_id);
    const history = await call("GET", `/api/v1/gps/vehicles/${vehicleA}/locations`, "admin-a");
    expect(history.status).toBe(200); expect(history.json.data.length).toBe(4);
    expect(history.json.data[0].external_record_id).toBe("delayed");
    expect(history.json.meta.count).toBe(4);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/locations?limit=501`, "admin-a")).status).toBe(422);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/locations?from=2020-01-01T00:00:00Z&to=2021-01-01T00:00:00Z`, "admin-a")).status).toBe(422);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "platform")).status).toBe(200);
    expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "driver")).status).toBe(403);
  });
  test("BIGINT company and vehicle IDs above 2^53 retain their exact values", async () => {
    const bigId = (9007199254740993n + BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000))).toString();
    workspace.set(bigId, "active");
    vehicles.set(bigId, { vehicle_id: bigId, company_id: bigId, vehicle_status: "active", current_driver_id: null });
    devices.set(`${bigId}:gps-big`, { gps_device_id: bigId, company_id: bigId, vehicle_id: bigId, source_type: "gps_device", disabled: false });
    const ingest = await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-big", recorded_at: at(), latitude: 13.7, longitude: 100.5 }, newApp(bigId, "gps-big"));
    expect(ingest.status).toBe(201); expect(ingest.json.data.company_id).toBe(bigId); expect(ingest.json.data.vehicle_id).toBe(bigId);
  });
  test("driver mobile requires the assigned vehicle and an in-progress job", async () => {
    const point = { device_code: "phone-demo", external_record_id: "phone-1", recorded_at: at(), latitude: 13.75, longitude: 100.5 };
    expect((await call("POST", "/api/v1/gps/ingest", "driver", point)).status).toBe(403);
    const key = `${companyA}:${vehicleA}:${driverId}`;
    activeJobs.add(key);
    expect((await call("POST", "/api/v1/gps/ingest", "driver", point)).status).toBe(201);
    expect((await call("POST", "/api/v1/gps/ingest", "driver", { ...point, device_code: "gps-demo", external_record_id: "wrong-source" })).status).toBe(403);
    activeJobs.delete(key);
    expect((await call("POST", "/api/v1/gps/ingest", "driver", { ...point, external_record_id: "phone-2" })).status).toBe(403);
  });
  test("suspended workspace blocks human callers and device credentials", async () => {
    workspace.set(companyA, "suspended");
    try {
      expect((await call("GET", `/api/v1/gps/vehicles/${vehicleA}/latest`, "admin-a")).status).toBe(403);
      expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", recorded_at: at(), latitude: 1, longitude: 1 })).status).toBe(403);
    } finally { workspace.set(companyA, "active"); }
  });
  test("an unavailable upstream service fails closed with 503", async () => {
    const down = newApp(companyA, "gps-demo", { ...fleet, workspaceStatus: async () => { throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "down"); } });
    const before = await prisma.gpsLocation.count({ where: { company_id: BigInt(companyA) } });
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", recorded_at: at(), latitude: 1, longitude: 1 }, down)).status).toBe(503);
    expect(await prisma.gpsLocation.count({ where: { company_id: BigInt(companyA) } })).toBe(before);
  });
});

test("Gateway stores a driver phone fix and returns its latest position only to staff of that company", async () => {
  const phoneVehicle = String(run + 60n);
  const code = "apk-gateway-test";
  const job = `${companyA}:${phoneVehicle}:${driverId}`;
  vehicles.set(phoneVehicle, { vehicle_id: phoneVehicle, company_id: companyA, vehicle_status: "active", current_driver_id: driverId });
  devices.set(`${companyA}:${code}`, { gps_device_id: String(run + 61n), company_id: companyA, vehicle_id: phoneVehicle, source_type: "driver_mobile_app", disabled: false });
  const service = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => app.handle(request) });
  const gateway = createGateway({ GPS_DATA_SERVICE_URL: service.url.origin }).compile();
  const read = (ids: string, token?: string) => call("GET", `/api/v1/gps/fleet/latest?vehicle_ids=${ids}`, token, undefined, gateway);

  try {
    const point = { device_code: code, external_record_id: "phone-current", latitude: 13.7563, longitude: 100.5018, direction_degree: 90, recorded_at: at() };
    const write = (body: object) => call("POST", "/api/v1/gps/ingest", "driver", body, gateway);
    expect((await write(point)).status).toBe(403);
    expect((await read(phoneVehicle, "admin-a")).json.data.points).toEqual([]);
    activeJobs.add(job);

    const late = { ...point, external_record_id: "phone-late", recorded_at: at(-600_000) };
    expect((await write(late)).status).toBe(201);
    const old = await read(phoneVehicle, "admin-a");
    expect(old.json.data.points[0].freshness).toBe("delayed");
    expect((await write(point)).status).toBe(201);
    expect((await write({ ...late, external_record_id: "phone-backfill" })).status).toBe(201);

    for (const token of ["admin-a", "dispatcher"]) {
      const latest = await read(`${phoneVehicle},${phoneVehicle},${vehicleB}`, token);
      expect(latest.status).toBe(200);
      expect(latest.json.data.company_id).toBe(companyA);
      expect(latest.json.data.points).toEqual([expect.objectContaining({
        vehicle_id: phoneVehicle, latitude: point.latitude, longitude: point.longitude,
        direction_degree: 90, speed_kmh: null, recorded_at: point.recorded_at,
        received_at: expect.any(String), freshness: "current", anomalies: [],
      })]);
    }
    expect((await read(phoneVehicle, "admin-b")).json.data.points).toEqual([]);
    expect((await read(phoneVehicle)).status).toBe(401);
    expect((await read(phoneVehicle, "driver")).status).toBe(403);
    expect((await read(phoneVehicle, deviceToken)).status).toBe(403);
    expect((await read(`${phoneVehicle}&company_id=${companyB}`, "admin-a")).status).toBe(422);
    expect((await read(Array(101).fill("1").join(","), "admin-a")).status).toBe(422);

    activeJobs.delete(job);
    expect((await write({ ...point, external_record_id: "after-job" })).status).toBe(403);
  } finally {
    activeJobs.delete(job);
    service.stop(true);
  }
});

describe("abnormal and missing data on stored points", () => {
  const send = (code: string, offsetMin: number, latitude: number, longitude: number, id: string) =>
    call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: code, external_record_id: id, recorded_at: at(offsetMin * 60_000), latitude, longitude }, newApp(companyA, code));
  test("each point is flagged against the one before it, and history reports the gaps", async () => {
    const p1 = await send("q-dev", -60, 13.7563, 100.5018, "q1");
    const p2 = await send("q-dev", -30, 13.76, 100.51, "q2");
    const p3 = await send("q-dev", -29, 18.7883, 98.9853, "q3"); // 583 km in one minute
    const p4 = await send("q-dev", -5, 0, 0, "q4");
    expect([p1, p2, p3, p4].map(p => p.status)).toEqual([201, 201, 201, 201]);
    expect(p1.json.data.anomalies).toEqual([]); expect(p2.json.data.anomalies).toEqual([]);
    expect(p3.json.data.anomalies).toEqual(["impossible_speed"]);
    expect(p4.json.data.anomalies).toContain("null_island");
    const history = await call("GET", `/api/v1/gps/vehicles/${vehicleQ}/locations`, "admin-a");
    expect(history.json.data.map((r: any) => r.anomalies.length > 0)).toEqual([false, false, true, true]);
    expect(history.json.meta.gaps.map((g: any) => g.minutes)).toEqual([30, 24]);
    const latest = await call("GET", `/api/v1/gps/vehicles/${vehicleQ}/latest`, "admin-a");
    expect(latest.json.data.anomalies).toContain("null_island");
    const window = await call("GET", `/api/v1/gps/vehicles/${vehicleQ}/locations?from=${encodeURIComponent(at(-31 * 60_000))}&to=${encodeURIComponent(at(-28 * 60_000))}`, "admin-a");
    expect(window.json.data.map((r: any) => r.external_record_id)).toEqual(["q2", "q3"]);
    expect(window.json.data[1].anomalies).toEqual(["impossible_speed"]); // compared with q2 inside the window
    expect(window.json.data[0].anomalies).toEqual([]); // q2 compared with q1, which is before the window
  });
  test("a late point is compared with the point before it in time, not the newest one", async () => {
    const late = await send("q-dev", -45, 13.7563, 100.5018, "q-late"); // between q1 (-60) and q2 (-30)
    expect(late.status).toBe(201); expect(late.json.data.anomalies).toEqual([]);
  });
});

describe("publishing new points to other services", () => {
  test("every stored point is handed to the publisher with its anomalies; refused ones are not", async () => {
    const before = published.length;
    const ok = await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", external_record_id: "pub-1", recorded_at: at(-2000), latitude: 13.7, longitude: 100.5 });
    expect(ok.status).toBe(201);
    expect(published.length).toBe(before + 1);
    expect(published.at(-1).gps_location_id).toBe(ok.json.data.gps_location_id); expect(published.at(-1).anomalies).toEqual([]);
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", external_record_id: "pub-1", recorded_at: at(-2000), latitude: 13.7, longitude: 100.5 })).status).toBe(409);
    expect((await call("POST", "/api/v1/gps/ingest", deviceToken, { device_code: "gps-demo", recorded_at: at(), latitude: 91, longitude: 100.5 })).status).toBe(422);
    expect(published.length).toBe(before + 1);
  });
  test("HTTP subscribers get the event with the internal token; a failing or missing one never breaks anything", async () => {
    const seen: { path: string; token: string | null; body: any }[] = [];
    let answer = 204;
    const server = Bun.serve({ port: 0, fetch: async (req) => { seen.push({ path: new URL(req.url).pathname, token: req.headers.get("x-internal-token"), body: await req.json() }); return new Response(null, { status: answer }); } });
    const wait = async (n: number) => { for (let i = 0; i < 50 && seen.length < n; i++) await Bun.sleep(20); };
    try {
      const publisher = httpEventPublisher(`http://127.0.0.1:${server.port}, http://127.0.0.1:1`); // the second one is unreachable
      publisher.locationStored({ gps_location_id: "1" });
      await wait(1);
      expect(seen[0]).toEqual({ path: "/internal/gps/locations", token: process.env.INTERNAL_API_TOKEN!, body: { event: "gps_location.stored", location: { gps_location_id: "1" } } });
      answer = 500;
      expect(() => publisher.locationStored({ gps_location_id: "2" })).not.toThrow();
      await wait(2);
      expect(seen.length).toBe(2);
    } finally { server.stop(true); }
    expect(() => httpEventPublisher("not a url")).toThrow();
    expect(() => httpEventPublisher("").locationStored({})).not.toThrow(); // no subscribers: nothing happens
  });
});

describe("internal API for tracking / route-history", () => {
  test("needs the internal token and never serves a user token", async () => {
    expect((await call("GET", `/internal/locations/latest?company_id=${companyA}&vehicle_id=${vehicleA}`)).status).toBe(401);
    expect((await call("GET", `/internal/locations/latest?company_id=${companyA}&vehicle_id=${vehicleA}`, "admin-a")).status).toBe(401);
  });
  test("serves latest and history by company and vehicle", async () => {
    const latest = await call("GET", `/internal/locations/latest?company_id=${companyA}&vehicle_id=${vehicleA}`, undefined, undefined, app, internal);
    expect(latest.status).toBe(200); expect(latest.json.data.vehicle_id).toBe(vehicleA);
    const history = await call("GET", `/internal/locations?company_id=${companyA}&vehicle_id=${vehicleA}&limit=2`, undefined, undefined, app, internal);
    expect(history.status).toBe(200); expect(history.json.data.length).toBe(2); expect(history.json.meta.limit).toBe(2);
    expect((await call("GET", `/internal/locations/latest?company_id=${companyB}&vehicle_id=${vehicleA}`, undefined, undefined, app, internal)).status).toBe(404);
  });
});
