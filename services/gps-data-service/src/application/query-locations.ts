import { ApiError, parseId, parseIdList, requireRole, type Identity } from "@vayro/service-kit";
import type { FleetGpsSnapshot } from "../../../../packages/shared-types";
import type { FleetDirectory } from "../adapters/fleet-directory";
import { anomaliesOf, assertHistoryRange, findGaps, freshness, type Fix } from "../domain/gps";
import * as locations from "../infrastructure/location.repository";
import { prisma } from "../lib/prisma";
import { toGpsLocation } from "../schemas/gps.schema";

const READERS = ["platform_admin", "company_admin", "dispatcher"] as const;
const fixOf = (row: locations.LocationRow): Fix => ({ latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(), recordedAt: row.recorded_at });

// ---- plain reads by (company, vehicle): used by the public endpoints below and by /internal for tracking / route-history ----

export async function historyFor(companyId: string, vehicleId: string, q: { from?: string; to?: string; limit?: number }) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
  assertHistoryRange(from, to);
  const limit = q.limit ?? 100;
  const vehicle = { vehicle_id: parseId(vehicleId), company_id: parseId(companyId) };
  const rows = (await locations.history(prisma, { ...vehicle, recorded_at: { gte: from, lte: to } }, limit)).reverse(); // oldest first
  // Abnormal data: each point is compared with the stored point before it (for the first one, the point before the window).
  let previous = rows[0] ? await locations.previousOf(prisma, vehicle, rows[0].recorded_at) : null;
  const mapped = rows.map((row) => {
    const out = toGpsLocation(row, anomaliesOf(fixOf(row), previous && fixOf(previous)));
    previous = row;
    return out;
  });
  // Missing data: stretches longer than GAP_MS with no point, among the points returned.
  return { rows: mapped, meta: { count: rows.length, limit, from: from.toISOString(), to: to.toISOString(), gaps: findGaps(rows.map((r) => r.recorded_at)) } };
}

export async function latestFor(companyId: string, vehicleId: string) {
  const vehicle = { vehicle_id: parseId(vehicleId), company_id: parseId(companyId) };
  const row = await locations.latest(prisma, vehicle);
  if (!row) throw new ApiError(404, "NO_LOCATION", "No position stored for this vehicle");
  const previous = await locations.previousOf(prisma, vehicle, row.recorded_at);
  return toGpsLocation(row, anomaliesOf(fixOf(row), previous && fixOf(previous)));
}

// ---- public endpoints: the vehicle lives in vehicle-service. Platform Admins may look across companies; everyone else stays in theirs ----

async function vehicleCompany(identity: Identity, fleet: FleetDirectory, vehicleId: string) {
  parseId(vehicleId);
  const vehicle = await fleet.getVehicle(identity.role === "platform_admin" ? null : identity.company_id, vehicleId);
  if (!vehicle) throw new ApiError(404, "NOT_FOUND", "Vehicle not found in this company");
  return vehicle.company_id;
}

export async function vehicleHistory(identity: Identity, fleet: FleetDirectory, vehicleId: string, q: { from?: string; to?: string; limit?: number }) {
  requireRole(identity, ...READERS);
  return historyFor(await vehicleCompany(identity, fleet, vehicleId), vehicleId, q);
}

export async function vehicleLatest(identity: Identity, fleet: FleetDirectory, vehicleId: string) {
  requireRole(identity, ...READERS);
  return latestFor(await vehicleCompany(identity, fleet, vehicleId), vehicleId);
}

export async function fleetLatest(identity: Identity, vehicleIds: string): Promise<FleetGpsSnapshot> {
  requireRole(identity, "company_admin", "dispatcher");
  if (!identity.company_id) throw new ApiError(403, "FORBIDDEN", "An active company is required");
  const ids = parseIdList(vehicleIds, parseId, 100);
  if (!ids?.length) throw new ApiError(422, "VALIDATION_ERROR", "Provide at least one vehicle id");

  const rows = await locations.latestFleetPoints(prisma, parseId(identity.company_id), ids);
  return {
    company_id: identity.company_id,
    points: rows.map((row) => ({
      vehicle_id: String(row.vehicle_id),
      latitude: row.latitude,
      longitude: row.longitude,
      speed_kmh: row.speed_kmh,
      direction_degree: row.direction_degree,
      recorded_at: row.recorded_at.toISOString(),
      received_at: row.received_at.toISOString(),
      freshness: freshness(row.recorded_at) === "current" ? freshness(row.received_at) : "delayed",
      anomalies: anomaliesOf(
        { latitude: row.latitude, longitude: row.longitude, recordedAt: row.recorded_at },
        row.previous_recorded_at && row.previous_latitude !== null && row.previous_longitude !== null
          ? { latitude: row.previous_latitude, longitude: row.previous_longitude, recordedAt: row.previous_recorded_at }
          : null,
      ),
    })),
  };
}
