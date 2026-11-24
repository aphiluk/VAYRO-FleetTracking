# 8. Route History Service

Route history of a vehicle over a time range: points, route and an approximate distance. Stores nothing of its own; reads gps-data-service, vehicle-service and transport-service.

| | |
| --- | --- |
| Database | none (stateless) |
| Owns tables | - |
| Gateway prefix | Reserved for a future Route History API |

## Public endpoints (from the project PDF, pages 18-26)

All three: Company Admin, Dispatcher (any vehicle of their company) and Driver (see below). `from` / `to` are ISO 8601 date-times; the default is the last 24 hours, and the range may not be longer than 31 days (422 otherwise).

| Method | Path | Answer |
| --- | --- | --- |
| [x] GET | `/api/v1/routes/vehicles/:id` | `{vehicle_id, from, to, summary, points}`: the whole route, oldest first (at most 5 000 points) |
| [x] GET | `/api/v1/routes/vehicles/:id/points` | The points only, oldest first, paged with `limit` (1 to 1000, default 200) and `offset`; `meta.total` |
| [x] GET | `/api/v1/routes/vehicles/:id/summary` | `point_count`, first/last time, `duration_minutes`, `distance_km`, `max_speed_kmh`, `avg_speed_kmh`, `gaps`, `anomalies`, `skipped_legs` |

Each point: `gps_location_id, latitude, longitude, speed_kmh, direction_degree, accuracy_meters, recorded_at, freshness, anomalies`. Points are ordered by `recorded_at` (when the position happened), never by when it arrived.

`meta` carries `from`, `to`, `truncated` and, for a driver, `windows`.

## Rules and policies

- The vehicle must belong to the caller's company, otherwise 404 (a vehicle of another company looks the same as one that does not exist). `company_id` always comes from the signed-in user.
- **Driver:** sees only the stretches of their own jobs on that vehicle (from `actual_start_at` to the end of the job, or until now while it runs), asked from transport-service. A driver with no job on that vehicle in the range gets an empty route, not an error. Platform Admin has no access to routes.
- **Distance is approximate:** straight lines between consecutive stored points. A leg touching a point flagged abnormal (`null_island`, `impossible_speed`) is skipped and counted in `skipped_legs`. `avg_speed_kmh` is the mean of the speeds the source reported, not distance over time.
- **Gaps:** two consecutive points more than 10 minutes apart are listed in `summary.gaps`; the line between them is only a straight connection.
- **Long ranges:** gps-data-service returns at most 500 points per call, newest first, so a range is read by stepping back page by page, up to 10 pages (5 000 points). If the range holds more, the oldest points are missing and `meta.truncated` is `true`: ask for a shorter range. Every call reads the range again, so paging with `offset` re-reads it.

## Tests

`bun test` runs `test/route.test.ts` (range, paging, merge, summary, driver windows).

## Data it needs from other services (ask them over `/internal/*`, never their database)

- gps-data-service (stored points), vehicle-service (vehicle belongs to the company), transport-service (driver job windows), auth-service

## Code layout

`src/domain/route.ts` pure rules, `src/application/load-route.ts` reads a route, `src/adapters/` the three upstream services, `src/routes/routes.ts` the endpoints, `src/plugins/guard.ts` gives `authed(...roles)`.
