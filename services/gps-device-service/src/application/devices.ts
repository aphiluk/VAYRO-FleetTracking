import { ApiError, companyScope, parseId, requireRole, sum, zeroFilled, type Identity } from "@vayro/service-kit";
import type { VehicleDirectory } from "../adapters/vehicle-directory";
import { connectionStatus, DELAYED_AFTER_MS, isDisabled, settingsOf, validateSettings, type Settings } from "../domain/device";
import { encryptCredentials, keyFromEnv } from "../lib/crypto";
import * as devices from "../infrastructure/device.repository";
import { audit } from "../lib/audit";
import { prisma, Prisma } from "../lib/prisma";
import { toGpsDevice } from "../schemas/device.schema";

// Use cases for GPS devices. Authorization first, then rules, then persistence.
export interface Ctx {
  identity: Identity;
  vehicles: VehicleDirectory;
  ip: string | null;
}
const READERS = ["platform_admin", "company_admin", "dispatcher"] as const;
const WRITERS = ["platform_admin", "company_admin"] as const;
type Source = "gps_device" | "provider_api" | "driver_mobile_app";

const idText = (v: bigint) => String(v);
// undefined = leave as it is, null = remove, object = encrypt and store. A request without a configured key fails before any write.
function sealed(credentials: Settings | null | undefined): string | null | undefined {
  if (credentials === undefined || credentials === null) return credentials;
  if (JSON.stringify(credentials).length > 4096) throw new ApiError(422, "VALIDATION_ERROR", "credentials are too large");
  return encryptCredentials(credentials, keyFromEnv());
}
const json = (value: Settings | null | undefined) => (value === undefined ? undefined : value === null ? Prisma.DbNull : (value as Prisma.InputJsonObject));

async function findInScope(db: Prisma.TransactionClient, identity: Identity, id: string) {
  const device = await devices.findOne(db, { gps_device_id: parseId(id), ...companyScope(identity) });
  if (!device) throw new ApiError(404, "NOT_FOUND", "GPS device not found");
  return device;
}

async function requireVehicle(vehicles: VehicleDirectory, companyId: string, vehicleId: string) {
  if (!(await vehicles.getVehicle(companyId, vehicleId))) throw new ApiError(404, "NOT_FOUND", "Vehicle not found in this company");
}

export async function listDevices(identity: Identity, q: { company_id?: string; limit?: number; offset?: number }) {
  requireRole(identity, ...READERS);
  const rows = await devices.list(prisma, companyScope(identity, q.company_id), q.limit ?? 100, q.offset ?? 0);
  return rows.map(toGpsDevice);
}

export async function getDevice(identity: Identity, id: string) {
  requireRole(identity, ...READERS);
  return toGpsDevice(await findInScope(prisma, identity, id));
}

export async function getDeviceStatus(identity: Identity, id: string) {
  requireRole(identity, ...READERS);
  const device = toGpsDevice(await findInScope(prisma, identity, id));
  return { gps_device_id: device.gps_device_id, connection_status: device.connection_status, last_received_at: device.last_received_at, checked_at: new Date().toISOString() };
}

export async function createDevice(ctx: Ctx, body: { company_id?: string; vehicle_id: string; device_code: string; source_type: Source; provider_name?: string | null; connection_config?: Settings | null; credentials?: Settings | null }) {
  const { identity, vehicles, ip } = ctx;
  requireRole(identity, ...WRITERS);
  validateSettings(body.connection_config);
  const credentials = sealed(body.credentials);
  if (identity.role !== "platform_admin" && body.company_id && body.company_id !== identity.company_id) throw new ApiError(403, "FORBIDDEN", "Cannot create a device for another company");
  const companyId = identity.role === "platform_admin" ? body.company_id : identity.company_id;
  if (!companyId) throw new ApiError(422, "VALIDATION_ERROR", "Platform Admin must select company_id");
  const company = parseId(companyId);
  await requireVehicle(vehicles, companyId, body.vehicle_id);

  const row = await prisma.$transaction(async (tx) => {
    const device = await devices.create(tx, {
      company_id: company,
      vehicle_id: parseId(body.vehicle_id),
      device_code: body.device_code.trim(),
      source_type: body.source_type,
      provider_name: body.provider_name ?? null,
      connection_config: json(body.connection_config ?? undefined),
      credentials_encrypted: credentials ?? null,
    });
    await audit({ companyId: company, userId: identity.user_id, action: "gps_device.create", entityType: "gps_device", entityId: device.gps_device_id,
      newValue: { vehicle_id: idText(device.vehicle_id), device_code: device.device_code, credentials_set: credentials != null }, ip }, tx);
    return device;
  });
  return toGpsDevice(row);
}

export async function updateDevice(ctx: Ctx, id: string, body: { vehicle_id?: string; device_code?: string; source_type?: Source; provider_name?: string | null; connection_config?: Settings | null; credentials?: Settings | null }) {
  const { identity, vehicles, ip } = ctx;
  requireRole(identity, ...WRITERS);
  validateSettings(body.connection_config);
  const credentials = sealed(body.credentials);
  const current = await findInScope(prisma, identity, id);
  if (body.vehicle_id) await requireVehicle(vehicles, idText(current.company_id), body.vehicle_id);

  const row = await prisma.$transaction(async (tx) => {
    await devices.lock(tx, current.gps_device_id);
    const old = await findInScope(tx, identity, id);
    const device = await devices.update(tx, old.gps_device_id, {
      vehicle_id: body.vehicle_id ? parseId(body.vehicle_id) : undefined,
      device_code: body.device_code?.trim(),
      source_type: body.source_type,
      provider_name: body.provider_name,
      connection_config: json(body.connection_config),
      credentials_encrypted: credentials,
    });
    await audit({ companyId: old.company_id, userId: identity.user_id, action: "gps_device.update", entityType: "gps_device", entityId: old.gps_device_id,
      oldValue: { vehicle_id: idText(old.vehicle_id), device_code: old.device_code }, newValue: { vehicle_id: idText(device.vehicle_id), device_code: device.device_code, credentials_changed: body.credentials !== undefined }, ip }, tx);
    return device;
  });
  return toGpsDevice(row);
}

export async function setDeviceEnabled(ctx: Ctx, id: string, enabled: boolean) {
  const { identity, ip } = ctx;
  requireRole(identity, ...WRITERS);
  const current = await findInScope(prisma, identity, id);
  const row = await prisma.$transaction(async (tx) => {
    await devices.lock(tx, current.gps_device_id);
    const device = await findInScope(tx, identity, id);
    const wasDisabled = isDisabled(device.connection_config);
    if (wasDisabled === !enabled) return device;
    const updated = await devices.update(tx, device.gps_device_id, {
      connection_status: enabled ? undefined : "disconnected",
      connection_config: { ...(settingsOf(device.connection_config) ?? {}), disabled: !enabled } as Prisma.InputJsonObject,
    });
    await audit({ companyId: device.company_id, userId: identity.user_id, action: enabled ? "gps_device.enable" : "gps_device.disable", entityType: "gps_device", entityId: device.gps_device_id,
      oldValue: { disabled: wasDisabled, connection_status: device.connection_status }, newValue: { disabled: !enabled }, ip }, tx);
    return updated;
  });
  return toGpsDevice(row);
}

// The existing DELETE route disables the source and preserves the record and position history.
export const disableDevice = (ctx: Ctx, id: string) => setDeviceEnabled(ctx, id, false);

// ---- used by gps-data-service through /internal ----

export async function deviceByCode(companyId: string, deviceCode: string) {
  const device = await devices.findOne(prisma, { company_id: parseId(companyId), device_code: deviceCode });
  if (!device) return null;
  return {
    gps_device_id: idText(device.gps_device_id),
    company_id: idText(device.company_id),
    vehicle_id: idText(device.vehicle_id),
    source_type: device.source_type,
    disabled: isDisabled(device.connection_config),
  };
}

export async function markReceived(id: string, at: Date) {
  await devices.update(prisma, parseId(id), { connection_status: "connected", last_received_at: at });
}

// ---- used by reporting-service through /internal (read only) ----

const MAX_REPORT_DEVICES = 5000;

// Counts of devices by derived connection status (a device that stopped reporting is "disconnected" whatever its stored
// status says), for one company or the whole platform. Counted in the database, so it is exact for any number of devices.
export async function deviceStats(companyId?: string) {
  const rows = await devices.statusCounts(prisma, companyId ? parseId(companyId) : undefined, new Date(Date.now() - DELAYED_AFTER_MS));
  const by_connection_status = zeroFilled(["connected", "disconnected", "error"], rows.map((r) => [r.status, r.n] as const));
  return { total: sum(by_connection_status), by_connection_status, disabled: rows.filter((r) => r.disabled).reduce((n, r) => n + r.n, 0) };
}

export async function devicesOfVehicles(companyId: string, vehicleIds?: bigint[]) {
  const rows = await devices.list(prisma, { company_id: parseId(companyId), ...(vehicleIds ? { vehicle_id: { in: vehicleIds } } : {}) }, MAX_REPORT_DEVICES, 0);
  return rows.map((d) => ({
    gps_device_id: idText(d.gps_device_id),
    vehicle_id: idText(d.vehicle_id),
    device_code: d.device_code,
    source_type: d.source_type,
    connection_status: connectionStatus(d),
    last_received_at: d.last_received_at?.toISOString() ?? null,
    disabled: isDisabled(d.connection_config),
  }));
}
