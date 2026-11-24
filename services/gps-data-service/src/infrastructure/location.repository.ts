import { Prisma, type Db } from "../lib/prisma";

// The only place that talks to gps_locations.
export type LocationRow = Prisma.GpsLocationGetPayload<object>;

export const exists = async (db: Db, deviceId: bigint, externalRecordId: string) =>
  (await db.gpsLocation.findUnique({ where: { gps_device_id_external_record_id: { gps_device_id: deviceId, external_record_id: externalRecordId } }, select: { gps_location_id: true } })) !== null;

export const insert = (db: Db, data: Prisma.GpsLocationUncheckedCreateInput) => db.gpsLocation.create({ data });

// Newest first; the caller reverses it for chronological output.
export const history = (db: Db, where: Prisma.GpsLocationWhereInput, take: number) =>
  db.gpsLocation.findMany({ where, orderBy: [{ recorded_at: "desc" }, { gps_location_id: "desc" }], take });

// The stored point just before `before` in recorded_at order (for abnormal-data checks).
export const previousOf = (db: Db, where: Prisma.GpsLocationWhereInput, before: Date) =>
  db.gpsLocation.findFirst({ where: { ...where, recorded_at: { lt: before } }, orderBy: [{ recorded_at: "desc" }, { gps_location_id: "desc" }] });

export const latest = (db: Db, where: Prisma.GpsLocationWhereInput) =>
  db.gpsLocation.findFirst({ where, orderBy: [{ recorded_at: "desc" }, { gps_location_id: "desc" }] });

interface FleetPointRow extends LatestPoint {
  direction_degree: number | null;
  previous_latitude: number | null;
  previous_longitude: number | null;
  previous_recorded_at: Date | null;
}

// Two index lookups per requested vehicle, with both reads explicitly scoped to the same company.
export const latestFleetPoints = (db: Db, company: bigint, ids: bigint[]) =>
  db.$queryRaw<FleetPointRow[]>(Prisma.sql`
    SELECT point.vehicle_id, point.latitude::float8, point.longitude::float8,
           point.speed_kmh::float8, point.direction_degree::float8, point.recorded_at, point.received_at,
           previous.latitude::float8 AS previous_latitude, previous.longitude::float8 AS previous_longitude,
           previous.recorded_at AS previous_recorded_at
    FROM (SELECT DISTINCT unnest(ARRAY[${Prisma.join(ids)}]::bigint[]) AS vehicle_id) requested
    JOIN LATERAL (
      SELECT vehicle_id, latitude, longitude, speed_kmh, direction_degree, recorded_at, received_at
      FROM gps_locations
      WHERE company_id = ${company} AND vehicle_id = requested.vehicle_id
      ORDER BY recorded_at DESC, gps_location_id DESC LIMIT 1
    ) point ON true
    LEFT JOIN LATERAL (
      SELECT latitude, longitude, recorded_at FROM gps_locations
      WHERE company_id = ${company} AND vehicle_id = requested.vehicle_id AND recorded_at < point.recorded_at
      ORDER BY recorded_at DESC, gps_location_id DESC LIMIT 1
    ) previous ON true`);

// ---- aggregates for reporting-service (read only) ----

const idFilter = (ids: bigint[] | undefined) => (ids ? Prisma.sql`AND vehicle_id IN (${Prisma.join(ids)})` : Prisma.empty);

export interface LatestPoint { vehicle_id: bigint; latitude: number; longitude: number; speed_kmh: number | null; recorded_at: Date; received_at: Date }

// The newest point of each vehicle of a company (or of the given vehicles). DISTINCT ON walks the
// (company_id, vehicle_id, recorded_at) index, so it reads one row per vehicle, not the whole history.
export const latestPerVehicle = (db: Db, company: bigint, ids: bigint[] | undefined, limit: number) =>
  db.$queryRaw<LatestPoint[]>(Prisma.sql`
    SELECT DISTINCT ON (vehicle_id) vehicle_id, latitude::float8 AS latitude, longitude::float8 AS longitude,
           speed_kmh::float8 AS speed_kmh, recorded_at, received_at
    FROM gps_locations
    WHERE company_id = ${company} ${idFilter(ids)}
    ORDER BY vehicle_id, recorded_at DESC, gps_location_id DESC
    LIMIT ${limit}`);

export interface WindowStat {
  vehicle_id: bigint; points: number; distance_km: number; avg_speed_kmh: number | null; max_speed_kmh: number | null;
  first_recorded_at: Date; last_recorded_at: Date; last_received_at: Date;
  gaps: number; null_island: number; impossible_speed: number; late_points: number;
}

// Per vehicle, over the points recorded in [from, to]. Each point is compared with the one before it (same vehicle, in
// recorded_at order). Distance adds up straight-line (haversine) distances between consecutive points and leaves out
// moves faster than `maxKmh` (a bad fix, not driving), so it is an approximation, as the brief says.
// gaps = stretches longer than `gapSeconds`; late_points = points that reached the server more than `lateSeconds` after
// they were recorded.
export const windowStatsPerVehicle = (db: Db, company: bigint, from: Date, to: Date, ids: bigint[] | undefined, p: { maxKmh: number; gapSeconds: number; lateSeconds: number }) =>
  db.$queryRaw<WindowStat[]>(Prisma.sql`
    WITH p AS (
      SELECT vehicle_id, recorded_at, received_at, latitude::float8 AS lat, longitude::float8 AS lon, speed_kmh::float8 AS speed,
             lag(latitude::float8) OVER w AS plat, lag(longitude::float8) OVER w AS plon, lag(recorded_at) OVER w AS prec
      FROM gps_locations
      WHERE company_id = ${company} AND recorded_at >= ${from} AND recorded_at <= ${to} ${idFilter(ids)}
      WINDOW w AS (PARTITION BY vehicle_id ORDER BY recorded_at, gps_location_id)
    ), s AS (
      SELECT *, EXTRACT(EPOCH FROM (recorded_at - prec)) AS sec,
             CASE WHEN plat IS NULL THEN NULL
                  ELSE 2 * 6371 * asin(least(1, sqrt(power(sin(radians(lat - plat) / 2), 2) + cos(radians(plat)) * cos(radians(lat)) * power(sin(radians(lon - plon) / 2), 2)))) END AS km
      FROM p
    )
    SELECT vehicle_id,
           count(*)::int AS points,
           COALESCE(sum(km) FILTER (WHERE km IS NOT NULL AND sec > 0 AND km / (sec / 3600.0) <= ${p.maxKmh}::float8), 0)::float8 AS distance_km,
           avg(speed)::float8 AS avg_speed_kmh,
           max(speed)::float8 AS max_speed_kmh,
           min(recorded_at) AS first_recorded_at,
           max(recorded_at) AS last_recorded_at,
           max(received_at) AS last_received_at,
           (count(*) FILTER (WHERE sec > ${p.gapSeconds}::float8))::int AS gaps,
           (count(*) FILTER (WHERE lat = 0 AND lon = 0))::int AS null_island,
           (count(*) FILTER (WHERE km IS NOT NULL AND sec > 0 AND km / (sec / 3600.0) > ${p.maxKmh}::float8))::int AS impossible_speed,
           (count(*) FILTER (WHERE EXTRACT(EPOCH FROM (received_at - recorded_at)) > ${p.lateSeconds}::float8))::int AS late_points
    FROM s
    GROUP BY vehicle_id
    ORDER BY vehicle_id
    LIMIT 500`);
