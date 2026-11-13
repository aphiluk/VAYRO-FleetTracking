import { Elysia, t } from "elysia";
import { authenticate } from "../../auth-service/src/guard";
import { ApiError, http, ok } from "../../auth-service/src/http";
import { sql } from "../../auth-service/src/db";
import { audit } from "../../auth-service/src/audit";
import type { Role, GpsDevice, GpsLocation } from "../../../packages/shared-types/index";

export interface TokenIdentity { role: "gps_device"; company_id: string; device_code: string }
type Identity = { role: Role | "gps_device"; company_id: string | null; user_id?: string; device_code?: string };
const idPattern = /^[1-9][0-9]{0,18}$/;
const idSchema = t.String({ pattern: idPattern.source });
const nullableText = (maxLength: number) => t.Optional(t.Union([t.String({ maxLength }), t.Null()]));
const sourceSchema = t.Union([t.Literal("gps_device"), t.Literal("provider_api"), t.Literal("driver_mobile_app")]);
const configSchema = t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()]));
const deviceCodeSchema = t.String({ minLength: 1, maxLength: 100, pattern: "\\S" });
const deviceColumns = sql`gps_device_id, company_id, vehicle_id, device_code, source_type, provider_name, connection_config, connection_status, last_received_at, created_at, updated_at`;
const delayedAfterMs = 5 * 60 * 1000;
const allowedClockSkewMs = 30 * 1000;

function id(value: string) {
  if (!idPattern.test(value) || BigInt(value) > 9223372036854775807n) throw new ApiError(422, "VALIDATION_ERROR", "Expected a positive BIGINT string");
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function containsCredential(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredential);
  return isRecord(value) && Object.entries(value).some(([key, item]) => /(credential|secret|password|token|api[_-]?key)/i.test(key) || containsCredential(item));
}
function validateSettings(value?: Record<string, unknown> | null) {
  if (containsCredential(value)) throw new ApiError(422, "CREDENTIALS_NOT_SUPPORTED", "Do not send credentials in connection_config");
  if (value?.disabled !== undefined && typeof value.disabled !== "boolean") throw new ApiError(422, "VALIDATION_ERROR", "connection_config.disabled must be boolean");
}
export function parseTokenConfig(raw?: string): Map<string, TokenIdentity> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw || "{}"); } catch { throw new Error("TRACKING_API_TOKENS must be valid JSON"); }
  if (!isRecord(parsed)) throw new Error("TRACKING_API_TOKENS must be an object");
  const tokens = new Map<string, TokenIdentity>();
  for (const [token, value] of Object.entries(parsed)) {
    if (token.length < 24 || /\s/.test(token) || !isRecord(value) || value.role !== "gps_device" || typeof value.company_id !== "string" || typeof value.device_code !== "string" || !value.device_code.trim() || value.device_code.length > 100) {
      throw new Error("Device credentials require role=gps_device, company_id as a BIGINT string, and device_code; static user/admin tokens are not allowed");
    }
    tokens.set(token, { role: "gps_device", company_id: id(value.company_id), device_code: value.device_code.trim() });
  }
  return tokens;
}
function companyScope(identity: Identity, requested?: string) {
  if (requested) id(requested);
  if (identity.role === "platform_admin") return requested ? sql`company_id = ${requested}` : sql`TRUE`;
  if (requested && requested !== identity.company_id) throw new ApiError(403, "FORBIDDEN", "Cannot access another company");
  return sql`company_id = ${identity.company_id}`;
}
function requireRole(identity: Identity, ...roles: Identity["role"][]) {
  if (!roles.includes(identity.role)) throw new ApiError(403, "FORBIDDEN", "Insufficient role");
}
async function findDevice(db: typeof sql, identity: Identity, deviceId: string, lock = false) {
  const [row] = await db`SELECT ${deviceColumns} FROM gps_devices WHERE gps_device_id = ${id(deviceId)} AND ${companyScope(identity)} ${lock ? sql`FOR UPDATE` : sql``}`;
  if (!row) throw new ApiError(404, "NOT_FOUND", "GPS device not found");
  return row;
}
async function findVehicle(db: typeof sql, identity: Identity, vehicleId: string) {
  const [vehicle] = await db`SELECT vehicle_id, company_id, current_driver_id, vehicle_status FROM vehicles WHERE vehicle_id = ${id(vehicleId)} AND ${companyScope(identity)} FOR SHARE`;
  if (!vehicle) throw new ApiError(404, "NOT_FOUND", "Vehicle not found in this company");
  return vehicle;
}
type DeviceRow = Omit<GpsDevice, "created_at" | "updated_at" | "last_received_at"> & { created_at: Date; updated_at: Date; last_received_at: Date | null };
type LocationRow = Omit<GpsLocation, "latitude" | "longitude" | "speed_kmh" | "accuracy_meters" | "recorded_at" | "received_at" | "freshness"> & {
  latitude: string | number; longitude: string | number; speed_kmh: string | number | null; accuracy_meters: string | number | null; recorded_at: Date; received_at: Date;
};
function deviceStatus(row: DeviceRow): GpsDevice {
  const recent = row.last_received_at !== null && Date.now() - new Date(row.last_received_at).getTime() <= delayedAfterMs;
  return { ...row, created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at).toISOString(), last_received_at: row.last_received_at === null ? null : new Date(row.last_received_at).toISOString(),
    connection_status: row.connection_config?.disabled === true ? "disconnected" : row.connection_status === "error" ? "error" : recent ? "connected" : "disconnected" };
}
function position(row: LocationRow): GpsLocation {
  const age = Date.now() - new Date(row.recorded_at).getTime();
  return { ...row, recorded_at: new Date(row.recorded_at).toISOString(), received_at: new Date(row.received_at).toISOString(), latitude: Number(row.latitude), longitude: Number(row.longitude),
    speed_kmh: row.speed_kmh === null ? null : Number(row.speed_kmh),
    accuracy_meters: row.accuracy_meters === null ? null : Number(row.accuracy_meters),
    freshness: age > delayedAfterMs || age < -allowedClockSkewMs ? "delayed" : "current" };
}

export function createTrackingApp(options: { tokens?: ReadonlyMap<string, TokenIdentity> } = {}) {
  const tokens = options.tokens ?? parseTokenConfig(process.env.TRACKING_API_TOKENS);
  for (const value of tokens.values()) {
    if (value.role !== "gps_device") throw new Error("Static user/admin tokens are not allowed");
    id(value.company_id);
  }
  return new Elysia({ normalize: false }).use(http)
    .derive(async ({ request }): Promise<{ identity: Identity }> => {
      if (new URL(request.url).pathname === "/") return { identity: { role: "gps_device", company_id: null } };
      const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      const device = token ? tokens.get(token) : undefined;
      if (device) {
        const [company] = await sql`SELECT workspace_status FROM company WHERE company_id = ${device.company_id}`;
        if (company?.workspace_status !== "active") throw new ApiError(403, "WORKSPACE_NOT_ACTIVE", "Device workspace is not active");
        return { identity: device };
      }
      const user = await authenticate(request.headers.get("authorization") ?? undefined);
      return { identity: { role: user.role, company_id: user.company_id, user_id: user.user_id } };
    })
    .get("/", () => ({ service: "tracking-service", status: "ok" }))
    .get("/api/v1/gps-devices", async ({ identity, query }) => {
      requireRole(identity, "platform_admin", "company_admin", "dispatcher");
      const rows = await sql`SELECT ${deviceColumns} FROM gps_devices WHERE ${companyScope(identity, query.company_id)} ORDER BY gps_device_id LIMIT ${query.limit ?? 100} OFFSET ${query.offset ?? 0}`;
      return ok(rows.map(deviceStatus));
    }, { query: t.Object({ company_id: t.Optional(idSchema), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, multipleOf: 1 })), offset: t.Optional(t.Numeric({ minimum: 0, maximum: 2147483647, multipleOf: 1 })) }) })
    .get("/api/v1/gps-devices/:id", async ({ identity, params }) => {
      requireRole(identity, "platform_admin", "company_admin", "dispatcher");
      return ok(deviceStatus(await findDevice(sql, identity, params.id)));
    }, { params: t.Object({ id: idSchema }) })
    .post("/api/v1/gps-devices", async ({ identity, body, set, ip }) => {
      requireRole(identity, "platform_admin", "company_admin");
      validateSettings(body.connection_config);
      if (identity.role !== "platform_admin" && body.company_id && body.company_id !== identity.company_id) throw new ApiError(403, "FORBIDDEN", "Cannot create a device for another company");
      const companyId = identity.role === "platform_admin" ? body.company_id : identity.company_id;
      if (!companyId) throw new ApiError(422, "VALIDATION_ERROR", "Platform Admin must select company_id");
      id(companyId);
      const row = await sql.begin(async tx => {
        await findVehicle(tx, { ...identity, company_id: companyId, role: "company_admin" }, body.vehicle_id);
        const [device] = await tx`INSERT INTO gps_devices(company_id, vehicle_id, device_code, source_type, provider_name, connection_config)
          VALUES (${companyId}, ${body.vehicle_id}, ${body.device_code.trim()}, ${body.source_type}, ${body.provider_name ?? null}, ${body.connection_config ?? null}) RETURNING ${deviceColumns}`;
        await audit({ companyId, userId: identity.user_id, action: "gps_device.create", entityType: "gps_device", entityId: device.gps_device_id, newValue: { vehicle_id: device.vehicle_id, device_code: device.device_code }, ip }, tx);
        return device;
      });
      set.status = 201;
      return ok(deviceStatus(row), "GPS device created");
    }, { body: t.Object({ company_id: t.Optional(idSchema), vehicle_id: idSchema, device_code: deviceCodeSchema, source_type: sourceSchema, provider_name: nullableText(120), connection_config: configSchema }, { additionalProperties: false }) })
    .put("/api/v1/gps-devices/:id", async ({ identity, params, body, ip }) => {
      requireRole(identity, "platform_admin", "company_admin");
      validateSettings(body.connection_config);
      const row = await sql.begin(async tx => {
        const old = await findDevice(tx, identity, params.id, true);
        if (body.vehicle_id) await findVehicle(tx, { ...identity, role: "company_admin", company_id: old.company_id }, body.vehicle_id);
        const [device] = await tx`UPDATE gps_devices SET vehicle_id=${body.vehicle_id ?? old.vehicle_id}, device_code=${body.device_code?.trim() ?? old.device_code},
          source_type=${body.source_type ?? old.source_type}, provider_name=${body.provider_name === undefined ? old.provider_name : body.provider_name},
          connection_config=${body.connection_config === undefined ? old.connection_config : body.connection_config}
          WHERE gps_device_id=${old.gps_device_id} RETURNING ${deviceColumns}`;
        await audit({ companyId: old.company_id, userId: identity.user_id, action: "gps_device.update", entityType: "gps_device", entityId: old.gps_device_id,
          oldValue: { vehicle_id: old.vehicle_id, device_code: old.device_code }, newValue: { vehicle_id: device.vehicle_id, device_code: device.device_code }, ip }, tx);
        return device;
      });
      return ok(deviceStatus(row), "GPS device updated");
    }, { params: t.Object({ id: idSchema }), body: t.Object({ vehicle_id: t.Optional(idSchema), device_code: t.Optional(deviceCodeSchema), source_type: t.Optional(sourceSchema), provider_name: nullableText(120), connection_config: configSchema }, { additionalProperties: false, minProperties: 1 }) })
    .delete("/api/v1/gps-devices/:id", async ({ identity, params, ip }) => {
      requireRole(identity, "platform_admin", "company_admin");
      const row = await sql.begin(async tx => {
        const device = await findDevice(tx, identity, params.id, true);
        const settings = { ...(device.connection_config ?? {}), disabled: true };
        const [closed] = await tx`UPDATE gps_devices SET connection_status='disconnected', connection_config=${settings} WHERE gps_device_id=${device.gps_device_id} RETURNING ${deviceColumns}`;
        await audit({ companyId: device.company_id, userId: identity.user_id, action: "gps_device.disable", entityType: "gps_device", entityId: device.gps_device_id, oldValue: { connection_status: device.connection_status }, newValue: { disabled: true }, ip }, tx);
        return closed;
      });
      return ok(deviceStatus(row), "GPS connection disabled; history preserved");
    }, { params: t.Object({ id: idSchema }) })
    .get("/api/v1/gps-devices/:id/status", async ({ identity, params }) => {
      requireRole(identity, "platform_admin", "company_admin", "dispatcher");
      const device = deviceStatus(await findDevice(sql, identity, params.id));
      return ok({ gps_device_id: device.gps_device_id, connection_status: device.connection_status, last_received_at: device.last_received_at, checked_at: new Date().toISOString() });
    }, { params: t.Object({ id: idSchema }) })
    .post("/api/v1/gps/ingest", async ({ identity, body, set }) => {
      requireRole(identity, "gps_device", "driver");
      const deviceCode = body.device_code.trim();
      if (identity.role === "gps_device" && identity.device_code !== deviceCode) throw new ApiError(403, "FORBIDDEN", "Device code does not match credential");
      if (Date.parse(body.recorded_at) > Date.now() + allowedClockSkewMs) throw new ApiError(422, "VALIDATION_ERROR", "recorded_at is too far in the future");
      const row = await sql.begin(async tx => {
        const [device] = await tx`SELECT gps_device_id, vehicle_id, source_type, connection_config FROM gps_devices WHERE company_id=${identity.company_id} AND device_code=${deviceCode} FOR UPDATE`;
        if (!device) throw new ApiError(403, "FORBIDDEN", "Device is not registered for this company");
        if (device.connection_config?.disabled === true) throw new ApiError(403, "DEVICE_DISABLED", "GPS connection is disabled");
        if (identity.role === "driver") {
          const vehicle = await findVehicle(tx, identity, device.vehicle_id);
          const [job] = await tx`SELECT job_id FROM transport_jobs WHERE company_id=${identity.company_id} AND vehicle_id=${device.vehicle_id} AND driver_id=${identity.user_id} AND job_status='in_progress' LIMIT 1 FOR SHARE`;
          if (device.source_type !== "driver_mobile_app" || vehicle.current_driver_id !== identity.user_id || vehicle.vehicle_status !== "active" || !job) throw new ApiError(403, "FORBIDDEN", "Driver requires an assigned vehicle and active transport job");
        }
        const [point] = await tx`INSERT INTO gps_locations(company_id, vehicle_id, gps_device_id, external_record_id, latitude, longitude, speed_kmh, direction_degree, accuracy_meters, recorded_at)
          VALUES (${identity.company_id}, ${device.vehicle_id}, ${device.gps_device_id}, ${body.external_record_id ?? null}, ${body.latitude}, ${body.longitude}, ${body.speed_kmh ?? null}, ${body.direction_degree ?? null}, ${body.accuracy_meters ?? null}, ${body.recorded_at})
          ON CONFLICT (gps_device_id, external_record_id) DO NOTHING RETURNING *`;
        if (!point) throw new ApiError(409, "DUPLICATE_RECORD", "external_record_id already exists for this device");
        await tx`UPDATE gps_devices SET connection_status='connected', last_received_at=${point.received_at} WHERE gps_device_id=${device.gps_device_id}`;
        return point;
      });
      set.status = 201;
      return ok(position(row), "GPS position stored");
    }, { body: t.Object({ device_code: deviceCodeSchema, external_record_id: t.Optional(t.Union([t.String({ minLength: 1, maxLength: 100, pattern: "\\S" }), t.Null()])), recorded_at: t.String({ format: "date-time" }),
      latitude: t.Number({ minimum: -90, maximum: 90 }), longitude: t.Number({ minimum: -180, maximum: 180 }), speed_kmh: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 99999.99 }), t.Null()])),
      direction_degree: t.Optional(t.Union([t.Integer({ minimum: 0, maximum: 359 }), t.Null()])), accuracy_meters: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 999999.99 }), t.Null()])) }, { additionalProperties: false }) })
    .get("/api/v1/gps/vehicles/:vehicleId/locations", async ({ identity, params, query }) => {
      requireRole(identity, "platform_admin", "company_admin", "dispatcher");
      const vehicle = await findVehicle(sql, identity, params.vehicleId);
      const to = query.to ? new Date(query.to) : new Date();
      const from = query.from ? new Date(query.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
      if (from > to || to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) throw new ApiError(422, "VALIDATION_ERROR", "History range must be ordered and no longer than 31 days");
      const rows = await sql`SELECT * FROM gps_locations WHERE vehicle_id=${params.vehicleId} AND company_id=${vehicle.company_id} AND recorded_at BETWEEN ${from} AND ${to}
        ORDER BY recorded_at DESC, gps_location_id DESC LIMIT ${query.limit ?? 100}`;
      return { ...ok(rows.reverse().map(position)), meta: { count: rows.length, limit: query.limit ?? 100, from: from.toISOString(), to: to.toISOString() } };
    }, { params: t.Object({ vehicleId: idSchema }), query: t.Object({ from: t.Optional(t.String({ format: "date-time" })), to: t.Optional(t.String({ format: "date-time" })), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500, multipleOf: 1 })) }) })
    .get("/api/v1/gps/vehicles/:vehicleId/latest", async ({ identity, params }) => {
      requireRole(identity, "platform_admin", "company_admin", "dispatcher");
      const vehicle = await findVehicle(sql, identity, params.vehicleId);
      const [row] = await sql`SELECT * FROM gps_locations WHERE vehicle_id=${params.vehicleId} AND company_id=${vehicle.company_id} ORDER BY recorded_at DESC, gps_location_id DESC LIMIT 1`;
      if (!row) throw new ApiError(404, "NO_LOCATION", "No position stored for this vehicle");
      return ok(position(row));
    }, { params: t.Object({ vehicleId: idSchema }) });
}

if (import.meta.main) {
  createTrackingApp().listen({ hostname: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}
