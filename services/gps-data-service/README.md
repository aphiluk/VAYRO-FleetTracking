# 6. GPS Data Service

Receives GPS points from devices, providers or a driver's phone, validates them and stores them with `recorded_at` and `received_at`.

| | |
| --- | --- |
| Database | `gps_data_db` (role `gps_data_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `gps_locations` |
| Gateway prefix | `/api/v1/gps` |

## Data quality and events (PDF page 21, section 5.3)

- **Duplicates:** `external_record_id` is unique per device (`409 DUPLICATE_RECORD`).
- **Abnormal data:** every point carries `anomalies`, a list that is empty for a normal point. `null_island` = exactly (0, 0). `impossible_speed` = getting from the stored point before it to this one needs more than 250 km/h. Abnormal points are stored and flagged, never dropped. Checked on ingest (against the point before it in time), on `latest`, and on `locations`.
- **Missing data:** `GET .../locations` returns `meta.gaps`, the stretches of more than 10 minutes with no point among the points returned (`{from, to, minutes}`). Thresholds are `GAP_MS` and `MAX_PLAUSIBLE_KMH` in `src/domain/gps.ts`.
- **Push to other services:** `GPS_EVENT_SUBSCRIBERS` accepts comma-separated subscriber base URLs. A stored point is sent to each subscriber via `POST /internal/gps/locations` with `{"event":"gps_location.stored","location":{...public GPS point with anomalies}}` and the `x-internal-token` header. Delivery is best-effort and a failing subscriber does not fail ingestion. The list is empty by default because the repository has no subscriber implementation yet.

## Public endpoints (from the project PDF, pages 18-26)

- [x] `POST /api/v1/gps/ingest`
- [x] `GET /api/v1/gps/fleet/latest?vehicle_ids=1,2` for Company Admin and Dispatcher. The authenticated company selects the scope. Returns at most one stored fix per requested vehicle plus both timestamps, freshness and anomalies. Max 100 IDs per request. See [APK test workflow](../../docs/APK_GPS_TEST.md).
- [x] `GET /api/v1/gps/vehicles/:vehicleId/locations`
- [x] `GET /api/v1/gps/vehicles/:vehicleId/latest`

Every endpoint must check Authentication, Role and `company_id` from the signed-in user, never from the request body (PDF page 18).

## Internal API other services call (not routed by the gateway, needs `x-internal-token`)

- `GET /internal/locations/latest?company_id=&vehicle_id=`
- `GET /internal/locations?company_id=&vehicle_id=&from=&to=&limit=`
- `GET /internal/locations/latest-by-vehicle?company_id=&vehicle_ids=` the newest point of every vehicle (for reporting-service)
- `GET /internal/stats/vehicles?company_id=&from=&to=&vehicle_ids=` per vehicle: points, approximate distance, speeds, gaps, abnormal and late points over a window of at most 31 days, computed in SQL (for reporting-service)

## Data it needs from other services (ask them over `/internal/*`, never their database)

- gps-device-service (device by code, last-received update)
- vehicle-service, transport-service (driver rule), company-service (workspace status)
- auth-service (caller identity)

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Fields keep the Data Dictionary names (snake_case). BIGINT ids are strings in the API.
- Other services' ids (`company_id`, `vehicle_id`, ...) are plain columns without foreign keys.

## Code layout

`src/app.ts` builds the app, `src/config/env.ts` reads env, `src/plugins/guard.ts` gives `authed(...roles)` for protected routes. `src/lib/prisma.ts` is the database client.
Keep routes thin; put rules in a service / use-case file and every database call in a repository file (see `docs/PROJECT_STRUCTURE.md`).
