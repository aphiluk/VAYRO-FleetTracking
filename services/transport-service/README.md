# 9. Transport Job Service

Transport jobs: create, assign vehicle and driver, start, complete, report a problem, cancel.

| | |
| --- | --- |
| Database | `transport_db` (role `transport_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `transport_jobs`, `system_log` |
| Gateway prefix | `/api/v1/jobs`, `/api/v1/driver` |

## Public endpoints (from the project PDF, pages 18-26)

- [x] `GET /api/v1/jobs`
- [x] `GET /api/v1/jobs/:id`
- [x] `POST /api/v1/jobs`
- [x] `PUT /api/v1/jobs/:id`
- [x] `PATCH /api/v1/jobs/:id/assign`
- [x] `PATCH /api/v1/jobs/:id/accept`
- [x] `PATCH /api/v1/jobs/:id/start`
- [x] `PATCH /api/v1/jobs/:id/complete`
- [x] `PATCH /api/v1/jobs/:id/problem`
- [x] `PATCH /api/v1/jobs/:id/cancel`
- [x] `GET /api/v1/driver/jobs`

Every endpoint must check Authentication, Role and `company_id` from the signed-in user, never from the request body (PDF page 18).

Company Admin and Dispatcher manage jobs in their company; Platform Admin may filter by company and must select one on creation. Driver reads their own job detail/list and performs accept/start/complete/problem actions. Managers cannot perform these actions on a driver's behalf.

Creation requires `job_code`, `pickup_address`, `delivery_address`; optional fields are described by `CreateTransportJobRequest` in shared-types. Supplying both vehicle and driver makes a job `assigned`, otherwise `pending`. Assign accepts both nullable ids; it never changes the vehicle's permanent driver. Only pending/assigned jobs can be edited. Reads return `TransportJobRecord` with vehicle/driver display metadata. Lists are arrays, default 50/max 100 rows, with `limit`, `offset`, `q`, `job_status` and company filtering. IDs are strings and dates are UTC ISO strings.

Lifecycle: `assigned → accepted → in_progress → completed`; accepted/in-progress jobs can report a problem and resume with start. Cancel is allowed for managers from any nonterminal state. Exact retries of accept/start/complete/cancel and identical problem reports are idempotent and preserve timestamps. Accepted, in-progress and problem jobs reserve both driver and vehicle; concurrent accepts use transaction advisory locks. Jobs may queue in assigned state. Vehicle and Driver must be active and belong to the same company on creation/assignment and accept/start. Directory service lookups do not create cross-service database transactions.

GPS is not part of these actions. Optional cargo is plain text (max 2000 characters); route snapshots are bounded Valhalla/auto road previews with at most 25,000 coordinates and 2,000 steps. Coordinate pairs must both be set or both null; scheduled dates require a timezone and end must follow start. Stored snapshots are previews, not GPS history. Audit rows are atomic with state changes and omit route geometry, addresses and free text.

Transport requires `DATABASE_URL`, `INTERNAL_API_TOKEN`, `AUTH_SERVICE_URL`, `USER_SERVICE_URL`, `VEHICLE_SERVICE_URL`, `COMPANY_SERVICE_URL`. Run migrations and generate the client before starting. `bun test` uses the service's PostgreSQL database with unique test company ids and fake auth/directory adapters; test fixtures are retained.

When `ALERT_SERVICE_URL` is set, Transport sends assignment and problem alerts after the database commits. It also pauses the offline check when a running job stops. Alert delivery failure does not roll back the job.

## Internal API other services call (not routed by the gateway, needs `x-internal-token`)

- `GET /internal/jobs/in-progress?company_id=&vehicle_id=&driver_id=` returns `{exists}`
- `GET /internal/stats/jobs` and `GET /internal/jobs` provide Reporting counts and job rows.
- `GET /internal/jobs/driver-windows` provides job windows for Route History.
- `GET /internal/system-logs` provides Transport audit rows for Integration.

## Data it needs from other services (ask them over `/internal/*`, never their database)

- vehicle-service, user-service (vehicle and driver are in the same company)
- auth-service (caller identity)

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Fields keep the Data Dictionary names (snake_case). BIGINT ids are strings in the API.
- Other services' ids (`company_id`, `vehicle_id`, ...) are plain columns without foreign keys.

## Code layout

`src/app.ts` builds the app, `src/config/env.ts` reads env, `src/plugins/guard.ts` gives `authed(...roles)` for protected routes. `src/lib/prisma.ts` is the database client.
Keep routes thin; put rules in a service / use-case file and every database call in a repository file (see `docs/PROJECT_STRUCTURE.md`).


## Internal dashboard counts

`GET /internal/dashboard/summary?company_id=` requires an internal service token and an explicit valid company id. It returns only company-scoped aggregate counts for Reporting, without pagination or individual personal/GPS records. Database queries live in `src/modules/dashboard/dashboard.repository.ts`. Run `bun test test/dashboard.test.ts` against this service's local database to verify counts beyond 100 records, company isolation, zero counts and the internal guard. Fixtures use unique test-company ids and are retained.
