import { Elysia, t } from "elysia";
import { authenticate } from "../../auth-service/src/guard";
import { ApiError, http } from "../../auth-service/src/http";
import { sql } from "../../auth-service/src/db";

type Role = "platform_admin" | "company_admin" | "dispatcher" | "driver" | "gps_device";
type SourceType = "gps_device" | "provider_api" | "driver_mobile_app";
type ConnectionStatus = "connected" | "disconnected" | "error";
type ConnectionConfig = Record<string, unknown>;

export interface TokenIdentity {
  role: Role;
  companyId?: number;
  deviceIdentifier?: string;
}

interface GpsDevice {
  gps_device_id: number;
  company_id: number;
  vehicle_id: number;
  device_code: string;
  source_type: SourceType;
  provider_name: string | null;
  connection_config: ConnectionConfig | null;
  credentials_encrypted: null;
  connection_status: ConnectionStatus;
  last_received_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GpsLocation {
  id: string;
  external_record_id?: string;
  device_code: string;
  company_id: number;
  vehicle_id: number;
  latitude: number;
  longitude: number;
  speed_kph?: number;
  heading?: number;
  accuracy_m?: number;
  recorded_at: string;
  received_at: string;
}

const sourceTypes = [
  "gps_device",
  "provider_api",
  "driver_mobile_app",
] as const;
const delayedAfterMs = 5 * 60 * 1000;
const allowedClockSkewMs = 30 * 1000;

const createDeviceSchema = t.Object(
  {
    company_id: t.Optional(t.Integer({ minimum: 1 })),
    vehicle_id: t.Integer({ minimum: 1 }),
    device_code: t.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
    source_type: t.Union(sourceTypes.map((value) => t.Literal(value))),
    provider_name: t.Optional(
      t.Union([t.String({ maxLength: 120 }), t.Null()]),
    ),
    connection_config: t.Optional(
      t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
    ),
  },
  { additionalProperties: false },
);

const updateDeviceSchema = t.Object(
  {
    vehicle_id: t.Optional(t.Integer({ minimum: 1 })),
    device_code: t.Optional(t.String({ minLength: 1, maxLength: 100, pattern: "\\S" })),
    source_type: t.Optional(t.Union(sourceTypes.map((value) => t.Literal(value)))),
    provider_name: t.Optional(
      t.Union([t.String({ maxLength: 120 }), t.Null()]),
    ),
    connection_config: t.Optional(
      t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
    ),
  },
  { additionalProperties: false, minProperties: 1 },
);

const listQuerySchema = t.Object(
  { company_id: t.Optional(t.String({ pattern: "^[1-9][0-9]*$" })) },
  { additionalProperties: false },
);

const ingestSchema = t.Object(
  {
    device_code: t.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
    external_record_id: t.Optional(
      t.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
    ),
    recorded_at: t.String({ format: "date-time" }),
    latitude: t.Number({ minimum: -90, maximum: 90 }),
    longitude: t.Number({ minimum: -180, maximum: 180 }),
    speed_kph: t.Optional(t.Number({ minimum: 0, maximum: 1000 })),
    heading: t.Optional(t.Number({ minimum: 0, maximum: 360 })),
    accuracy_m: t.Optional(t.Number({ minimum: 0, maximum: 100000 })),
  },
  { additionalProperties: false },
);

const locationsQuerySchema = t.Object(
  {
    from: t.Optional(t.String({ format: "date-time" })),
    to: t.Optional(t.String({ format: "date-time" })),
    limit: t.Optional(t.String({ pattern: "^[1-9][0-9]{0,2}$" })),
  },
  { additionalProperties: false },
);

const roles = new Set<Role>([
  "platform_admin",
  "company_admin",
  "dispatcher",
  "gps_device",
]);

function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.has(value as Role);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsCredentialField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsCredentialField);
  }
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nestedValue]) =>
      /(credential|secret|password|token|api[_-]?key)/i.test(key) ||
      containsCredentialField(nestedValue),
  );
}

export function parseTokenConfig(raw: string | undefined): Map<string, TokenIdentity> {
  if (!raw) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TRACKING_API_TOKENS must contain valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("TRACKING_API_TOKENS must be a JSON object.");
  }

  const tokens = new Map<string, TokenIdentity>();
  for (const [token, value] of Object.entries(parsed)) {
    if (token.length < 24 || !isRecord(value) || !isRole(value.role)) {
      throw new Error("TRACKING_API_TOKENS contains an invalid token entry.");
    }

    const role = value.role;
    const companyId = value.companyId;
    const deviceIdentifier = value.deviceIdentifier;
    if (
      (role !== "platform_admin" &&
        (typeof companyId !== "number" ||
          !Number.isSafeInteger(companyId) ||
          companyId < 1)) ||
      (companyId !== undefined &&
        (typeof companyId !== "number" ||
          !Number.isSafeInteger(companyId) ||
          companyId < 1)) ||
      (role === "gps_device" &&
        (typeof deviceIdentifier !== "string" ||
          deviceIdentifier.trim().length === 0)) ||
      (role !== "gps_device" && deviceIdentifier !== undefined)
    ) {
      throw new Error("Token scope does not match its role.");
    }

    tokens.set(token, {
      role,
      ...(typeof companyId === "number" ? { companyId } : {}),
      ...(typeof deviceIdentifier === "string" ? { deviceIdentifier } : {}),
    });
  }

  return tokens;
}

function getIdentity(
  request: Request,
  tokens: ReadonlyMap<string, TokenIdentity>,
): TokenIdentity | null {
  const match = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(\S+)$/i);
  return match ? tokens.get(match[1]) ?? null : null;
}

function errorResponse(
  set: { status?: number | string },
  status: number,
  code: string,
  message: string,
) {
  set.status = status;
  return { error: { code, message } };
}

function canWrite(identity: TokenIdentity) {
  return identity.role === "platform_admin" || identity.role === "company_admin";
}

function canReadCompanyData(identity: TokenIdentity) {
  return (
    identity.role === "platform_admin" ||
    identity.role === "company_admin" ||
    identity.role === "dispatcher"
  );
}

function companyScopedDevice(
  device: GpsDevice | undefined,
  identity: TokenIdentity,
): device is GpsDevice {
  return (
    device !== undefined &&
    (identity.role === "platform_admin" || device.company_id === identity.companyId)
  );
}

function uniqueDeviceCode(
  devices: ReadonlyMap<number, GpsDevice>,
  companyId: number,
  deviceCode: string,
  exceptId?: number,
) {
  return [...devices.values()].some(
    (device) =>
      device.gps_device_id !== exceptId &&
      device.company_id === companyId &&
      device.device_code === deviceCode,
  );
}

function withConnectionStatus(device: GpsDevice, now = Date.now()) {
  const lastReceived = device.last_received_at
    ? Date.parse(device.last_received_at)
    : undefined;
  const recent =
    lastReceived !== undefined &&
    Number.isFinite(lastReceived) &&
    now - lastReceived <= delayedAfterMs;
  return {
    ...device,
    connection_status:
      device.connection_status === "error"
        ? "error"
        : recent
          ? "connected"
          : "disconnected",
  };
}

function locationWithFreshness(location: GpsLocation, now = Date.now()) {
  const ageMs = now - Date.parse(location.recorded_at);
  return {
    ...location,
    freshness:
      ageMs < -allowedClockSkewMs || ageMs > delayedAfterMs ? "delayed" : "current",
  };
}

export function createTrackingApp(options: {
  tokens?: ReadonlyMap<string, TokenIdentity>;
} = {}) {
  const tokens = options.tokens ?? parseTokenConfig(process.env.TRACKING_API_TOKENS);
  if ([...tokens.values()].some(identity => identity.role !== "gps_device")) {
    throw new Error("TRACKING_API_TOKENS accepts device credentials only; users must log in through Authentication");
  }
  const devices = new Map<number, GpsDevice>();
  const locations: GpsLocation[] = [];
  const externalRecordIds = new Set<string>();
  let nextDeviceId = 1;

  return new Elysia({ normalize: false })
    .use(http)
    .derive(async ({ request }): Promise<{ identity: TokenIdentity | null }> => {
      if (new URL(request.url).pathname === "/") return { identity: null };
      const deviceIdentity = getIdentity(request, tokens);
      if (deviceIdentity) {
        const [company] = await sql`SELECT workspace_status FROM company WHERE company_id = ${deviceIdentity.companyId}`;
        if (company?.workspace_status !== "active") throw new ApiError(403, "WORKSPACE_NOT_ACTIVE", "Device workspace is not active");
        return { identity: deviceIdentity };
      }
      const user = await authenticate(request.headers.get("authorization") ?? undefined);
      const companyId = user.company_id === null ? undefined : Number(user.company_id);
      if (companyId !== undefined && !Number.isSafeInteger(companyId)) {
        throw new ApiError(422, "UNSUPPORTED_ID_RANGE", "The GPS demo supports company IDs within the safe integer range only");
      }
      return { identity: { role: user.role, companyId } };
    })
    .onAfterHandle(({ responseValue, requestId }) => {
      if (responseValue && typeof responseValue === "object" && "data" in responseValue && !("success" in responseValue)) {
        return { success: true, ...responseValue, message: "OK", request_id: requestId };
      }
      if (responseValue && typeof responseValue === "object" && "error" in responseValue && !("success" in responseValue)) {
        return { success: false, ...responseValue, request_id: requestId };
      }
    })
    .onBeforeHandle(({ identity, request, set }) => {
      if (new URL(request.url).pathname === "/") return;
      if (!identity) {
        return errorResponse(
          set,
          401,
          "UNAUTHORIZED",
          "A valid Bearer token is required.",
        );
      }
    })
    .onError(({ code, error, set }) => {
      if (error instanceof ApiError) return errorResponse(set, error.status, error.code, error.message);
      if (code === "VALIDATION") {
        return errorResponse(set, 422, "VALIDATION_ERROR", "Request validation failed.");
      }
      if (code === "PARSE") {
        return errorResponse(set, 400, "INVALID_JSON", "Request body must be valid JSON.");
      }
    })
    .get("/", () => ({ status: "ok", service: "tracking-service" }))
    .get(
      "/api/v1/gps-devices",
      ({ identity, query, set }) => {
        if (!identity) {
          return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
        }
        if (!canReadCompanyData(identity)) {
          return errorResponse(set, 403, "FORBIDDEN", "This credential cannot read GPS device records.");
        }
        const requestedCompanyId = query.company_id
          ? Number(query.company_id)
          : undefined;
        if (
          requestedCompanyId !== undefined &&
          !Number.isSafeInteger(requestedCompanyId)
        ) {
          return errorResponse(set, 400, "INVALID_COMPANY_ID", "company_id must be a positive integer.");
        }
        if (
          identity.role !== "platform_admin" &&
          requestedCompanyId !== undefined &&
          requestedCompanyId !== identity.companyId
        ) {
          return errorResponse(set, 403, "FORBIDDEN", "Access to this company is not allowed.");
        }

        const companyId =
          identity.role === "platform_admin" ? requestedCompanyId : identity.companyId;
        const data = [...devices.values()]
          .filter((device) => !companyId || device.company_id === companyId)
          .map((device) => withConnectionStatus(device));
        return { data };
      },
      { query: listQuerySchema },
    )
    .get("/api/v1/gps-devices/:id", ({ identity, params, set }) => {
      if (!identity) {
        return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
      }
      if (!canReadCompanyData(identity)) {
        return errorResponse(set, 403, "FORBIDDEN", "This credential cannot read GPS device records.");
      }
      const id = Number(params.id);
      const device = Number.isSafeInteger(id) ? devices.get(id) : undefined;
      if (!companyScopedDevice(device, identity)) {
        return errorResponse(set, 404, "NOT_FOUND", "GPS device was not found.");
      }
      return { data: withConnectionStatus(device) };
    })
    .post(
      "/api/v1/gps-devices",
      ({ identity, body, set }) => {
        if (!identity) {
          return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
        }
        if (!canWrite(identity)) {
          return errorResponse(set, 403, "FORBIDDEN", "This role cannot manage GPS devices.");
        }
        if (containsCredentialField(body.connection_config)) {
          return errorResponse(
            set,
            422,
            "CREDENTIALS_NOT_SUPPORTED",
            "Credentials must not be sent in connection_config.",
          );
        }

        let companyId: number;
        if (identity.role === "platform_admin") {
          if (body.company_id === undefined) {
            return errorResponse(set, 400, "COMPANY_REQUIRED", "company_id is required.");
          }
          companyId = body.company_id;
        } else {
          if (body.company_id !== undefined && body.company_id !== identity.companyId) {
            return errorResponse(set, 403, "FORBIDDEN", "A device cannot be created for another company.");
          }
          if (!identity.companyId) {
            return errorResponse(set, 403, "FORBIDDEN", "Token is not scoped to a company.");
          }
          companyId = identity.companyId;
        }
        if (uniqueDeviceCode(devices, companyId, body.device_code)) {
          return errorResponse(set, 409, "DEVICE_CODE_IN_USE", "device_code is already registered for this company.");
        }

        const now = new Date().toISOString();
        const device: GpsDevice = {
          gps_device_id: nextDeviceId++,
          company_id: companyId,
          vehicle_id: body.vehicle_id,
          device_code: body.device_code,
          source_type: body.source_type,
          provider_name: body.provider_name ?? null,
          connection_config: body.connection_config ?? null,
          credentials_encrypted: null,
          connection_status: "disconnected",
          last_received_at: null,
          created_at: now,
          updated_at: now,
        };
        devices.set(device.gps_device_id, device);
        set.status = 201;
        return { data: device };
      },
      { body: createDeviceSchema },
    )
    .put(
      "/api/v1/gps-devices/:id",
      ({ identity, params, body, set }) => {
        if (!identity) {
          return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
        }
        if (!canWrite(identity)) {
          return errorResponse(set, 403, "FORBIDDEN", "This role cannot manage GPS devices.");
        }
        if (containsCredentialField(body.connection_config)) {
          return errorResponse(
            set,
            422,
            "CREDENTIALS_NOT_SUPPORTED",
            "Credentials must not be sent in connection_config.",
          );
        }
        const id = Number(params.id);
        const device = Number.isSafeInteger(id) ? devices.get(id) : undefined;
        if (!companyScopedDevice(device, identity)) {
          return errorResponse(set, 404, "NOT_FOUND", "GPS device was not found.");
        }

        const deviceCode = body.device_code ?? device.device_code;
        if (uniqueDeviceCode(devices, device.company_id, deviceCode, device.gps_device_id)) {
          return errorResponse(set, 409, "DEVICE_CODE_IN_USE", "device_code is already registered for this company.");
        }
        const updated: GpsDevice = {
          ...device,
          ...body,
          device_code: deviceCode,
          provider_name:
            body.provider_name !== undefined
              ? body.provider_name
              : device.provider_name,
          connection_config:
            body.connection_config !== undefined
              ? body.connection_config
              : device.connection_config,
          updated_at: new Date().toISOString(),
        };
        devices.set(updated.gps_device_id, updated);
        return { data: withConnectionStatus(updated) };
      },
      { body: updateDeviceSchema },
    )
    .delete("/api/v1/gps-devices/:id", ({ identity, params, set }) => {
      if (!identity) {
        return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
      }
      if (!canWrite(identity)) {
        return errorResponse(set, 403, "FORBIDDEN", "This role cannot manage GPS devices.");
      }
      const id = Number(params.id);
      const device = Number.isSafeInteger(id) ? devices.get(id) : undefined;
      if (!companyScopedDevice(device, identity)) {
        return errorResponse(set, 404, "NOT_FOUND", "GPS device was not found.");
      }
      devices.delete(device.gps_device_id);
      return { data: { gps_device_id: device.gps_device_id, deleted: true } };
    })
    .get("/api/v1/gps-devices/:id/status", ({ identity, params, set }) => {
      if (!identity) {
        return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
      }
      if (!canReadCompanyData(identity)) {
        return errorResponse(set, 403, "FORBIDDEN", "This credential cannot read GPS device status.");
      }
      const id = Number(params.id);
      const device = Number.isSafeInteger(id) ? devices.get(id) : undefined;
      if (!companyScopedDevice(device, identity)) {
        return errorResponse(set, 404, "NOT_FOUND", "GPS device was not found.");
      }
      return {
        data: {
          gps_device_id: device.gps_device_id,
          connection_status: withConnectionStatus(device).connection_status,
          last_received_at: device.last_received_at,
          checked_at: new Date().toISOString(),
        },
      };
    })
    .post(
      "/api/v1/gps/ingest",
      ({ identity, body, set }) => {
        if (!identity) {
          return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
        }
        if (identity.role !== "gps_device" || !identity.deviceIdentifier) {
          return errorResponse(set, 403, "FORBIDDEN", "A GPS device credential is required.");
        }
        if (body.device_code !== identity.deviceIdentifier) {
          return errorResponse(set, 403, "DEVICE_CODE_MISMATCH", "device_code does not match this credential.");
        }

        const device = [...devices.values()].find(
          (item) =>
            item.company_id === identity.companyId &&
            item.device_code === body.device_code,
        );
        if (!device) {
          return errorResponse(set, 403, "DEVICE_NOT_AUTHORIZED", "GPS device is not registered for this company.");
        }

        const recordedAtMs = Date.parse(body.recorded_at);
        const receivedAtMs = Date.now();
        if (!Number.isFinite(recordedAtMs) || recordedAtMs > receivedAtMs + allowedClockSkewMs) {
          return errorResponse(set, 422, "INVALID_RECORDED_AT", "recorded_at must be valid and cannot be in the future.");
        }

        const deduplicationKey = body.external_record_id
          ? JSON.stringify([device.gps_device_id, body.external_record_id])
          : undefined;
        if (deduplicationKey && externalRecordIds.has(deduplicationKey)) {
          return errorResponse(set, 409, "DUPLICATE_RECORD", "external_record_id was already received for this device.");
        }

        const location: GpsLocation = {
          id: crypto.randomUUID(),
          ...(body.external_record_id
            ? { external_record_id: body.external_record_id }
            : {}),
          device_code: device.device_code,
          company_id: device.company_id,
          vehicle_id: device.vehicle_id,
          latitude: body.latitude,
          longitude: body.longitude,
          ...(body.speed_kph !== undefined ? { speed_kph: body.speed_kph } : {}),
          ...(body.heading !== undefined ? { heading: body.heading } : {}),
          ...(body.accuracy_m !== undefined ? { accuracy_m: body.accuracy_m } : {}),
          recorded_at: new Date(recordedAtMs).toISOString(),
          received_at: new Date(receivedAtMs).toISOString(),
        };
        locations.push(location);
        if (deduplicationKey) externalRecordIds.add(deduplicationKey);
        devices.set(device.gps_device_id, {
          ...device,
          connection_status: "connected",
          last_received_at: location.received_at,
          updated_at: location.received_at,
        });
        set.status = 201;
        return {
          data: locationWithFreshness(location, receivedAtMs),
        };
      },
      { body: ingestSchema },
    )
    .get(
      "/api/v1/gps/vehicles/:vehicleId/locations",
      ({ identity, params, query, set }) => {
        if (!identity) {
          return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
        }
        if (!canReadCompanyData(identity)) {
          return errorResponse(set, 403, "FORBIDDEN", "This credential cannot read GPS location history.");
        }
        const vehicleId = Number(params.vehicleId);
        if (!Number.isSafeInteger(vehicleId) || vehicleId < 1) {
          return errorResponse(set, 404, "NOT_FOUND", "Vehicle location history was not found.");
        }

        const limit = query.limit ? Number(query.limit) : 100;
        if (limit > 500) {
          return errorResponse(set, 400, "INVALID_LIMIT", "limit must not exceed 500.");
        }
        const from = query.from ? Date.parse(query.from) : undefined;
        const to = query.to ? Date.parse(query.to) : undefined;
        if (
          (from !== undefined && !Number.isFinite(from)) ||
          (to !== undefined && !Number.isFinite(to)) ||
          (from !== undefined && to !== undefined && from > to)
        ) {
          return errorResponse(set, 400, "INVALID_TIME_RANGE", "from must be earlier than or equal to to.");
        }

        const data = locations
          .filter((location) => {
            const recordedAt = Date.parse(location.recorded_at);
            return (
              location.vehicle_id === vehicleId &&
              (identity.role === "platform_admin" ||
                location.company_id === identity.companyId) &&
              (from === undefined || recordedAt >= from) &&
              (to === undefined || recordedAt <= to)
            );
          })
          .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
          .slice(-limit)
          .map((location) => locationWithFreshness(location));
        return { data, meta: { count: data.length, limit } };
      },
      { query: locationsQuerySchema },
    )
    .get(
      "/api/v1/gps/vehicles/:vehicleId/latest",
      ({ identity, params, set }) => {
        if (!identity) {
          return errorResponse(set, 401, "UNAUTHORIZED", "A valid Bearer token is required.");
        }
        if (!canReadCompanyData(identity)) {
          return errorResponse(set, 403, "FORBIDDEN", "This credential cannot read GPS locations.");
        }
        const vehicleId = Number(params.vehicleId);
        if (!Number.isSafeInteger(vehicleId) || vehicleId < 1) {
          return errorResponse(set, 404, "NOT_FOUND", "Vehicle location was not found.");
        }

        const latest = locations
          .filter(
            (location) =>
              location.vehicle_id === vehicleId &&
              (identity.role === "platform_admin" ||
                location.company_id === identity.companyId),
          )
          .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0];
        if (!latest) {
          return errorResponse(set, 404, "NO_LOCATION", "No GPS location has been received for this vehicle.");
        }
        return { data: locationWithFreshness(latest) };
      },
    );
}

if (import.meta.main) {
  const app = createTrackingApp().listen({
    hostname: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  });

  console.log(
    `Tracking service is listening at ${app.server?.hostname}:${app.server?.port}`,
  );
}
