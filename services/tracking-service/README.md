# 7. Vehicle Tracking Service

Live view of vehicle positions: latest position, GPS status and freshness per vehicle. Stores nothing of its own; reads gps-data-service, vehicle-service and gps-device-service.

| | |
| --- | --- |
| Database | none (stateless) |
| Owns tables | - |
| Gateway prefix | Reserved for a future Fleet Tracking API |

## Public endpoints (from the project PDF, pages 18-26)

- [ ] `GET /api/v1/tracking/vehicles`
- [ ] `GET /api/v1/tracking/vehicles/:id`
- [ ] `GET /api/v1/tracking/latest`

Every endpoint must check Authentication, Role and `company_id` from the signed-in user, never from the request body (PDF page 18).

## Data it needs from other services (ask them over `/internal/*`, never their database)

- gps-data-service (latest positions)
- vehicle-service (vehicles of the company)
- gps-device-service (connection status)
- auth-service

## Code layout

`src/app.ts` builds the app, `src/config/env.ts` reads env, `src/plugins/guard.ts` gives `authed(...roles)` for protected routes.
Keep routes thin; put rules in a service / use-case file and every database call in a repository file (see `docs/PROJECT_STRUCTURE.md`).
