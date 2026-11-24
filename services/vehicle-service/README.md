# 4. Vehicle Service

Vehicles, vehicle types, vehicle status and the driver assigned to a vehicle.

| | |
| --- | --- |
| Database | `vehicle_db` (role `vehicle_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `vehicle_types`, `vehicles` |
| Gateway prefix | `/api/v1/vehicles`, `/api/v1/vehicle-types` |

## Public endpoints (from the project PDF, pages 18-26)

- [x] `GET /api/v1/vehicles`
- [x] `GET /api/v1/vehicles/:id`
- [x] `POST /api/v1/vehicles`
- [x] `PUT /api/v1/vehicles/:id`
- [x] `DELETE /api/v1/vehicles/:id`
- [x] `PATCH /api/v1/vehicles/:id/driver`
- [x] `PATCH /api/v1/vehicles/:id/status`
- [x] `GET /api/v1/vehicle-types`
- [x] `POST /api/v1/vehicle-types`
- [x] `PUT /api/v1/vehicle-types/:id`
- [x] `DELETE /api/v1/vehicle-types/:id`

All endpoints authenticate through auth-service. Company Admin manages their own company's records, Dispatcher has read access, and Driver cannot access vehicle management. Platform Admin can list across companies, filter by `company_id`, and create records in an explicitly selected existing company. Company Admin cannot override their company scope. Updates do not accept a company change.

## Requests and responses

All public replies use the shared `ApiResponse<T>` envelope. BIGINT ids are strings, dates are UTC ISO strings, and the record shapes are `VehicleRecord` and `VehicleTypeRecord` in `packages/shared-types`.

- Vehicle list accepts `limit` (1–100, default 50), `offset` (default 0), `q` (vehicle code or plate, case-insensitive), `vehicle_status` and Platform Admin's optional `company_id`. All statuses are included when no status filter is supplied. Returns `VehicleRecord[]`, ordered by `vehicle_id`.
- Type list accepts the same pagination and company filter, plus `is_active=true|false`. Inactive types remain visible by default. Returns `VehicleTypeRecord[]`, ordered by `vehicle_type_id`.
- Vehicle creation requires `vehicle_code` (1–50 characters) and `license_plate` (1–30). Optional `vehicle_type_id` and `current_driver_id` default to null. `vehicle_status` defaults to `active` and supports `active`, `inactive`, `maintenance`. Returns 201 and the saved record.
- Type creation requires `type_name` (1–80). Optional `description` is nullable, up to 255 characters. `is_active` defaults to true. Returns 201 and the saved type.
- `PUT` requests are partial updates. An empty object or unknown properties are rejected. Omitted values are preserved. An explicit null clears the vehicle's type or driver, or the type's description. The driver patch requires `{current_driver_id:string|null}`. The status patch requires `{vehicle_status:VehicleStatus}`.
- Required text is trimmed and whitespace-only input is rejected. PostgreSQL null characters are rejected before writes. Vehicle codes and type names are unique inside the company through the existing schema indexes. The current dictionary permits repeated license plates, so the API does not add a new plate uniqueness rule.

`DELETE /vehicles/:id` sets `vehicle_status=inactive`. `DELETE /vehicle-types/:id` sets `is_active=false`. Both return the updated record and preserve rows, references, GPS data and transport history. Reactivation is available through the update/status API.

## References, concurrency and audit

Vehicle types must belong to the vehicle's company. Newly assigned types must be active. The user directory verifies that a newly assigned driver is an active Driver in the same company. A foreign-company or missing reference returns 404. An inactive new reference returns 422.

For an existing vehicle, unchanged type/driver references are checked for company ownership but can remain after the type or driver is deactivated. This permits editing a plate or vehicle code while preserving historical references. User/role changes in user-service are checked at the next vehicle operation; there is no cross-service database transaction.

Vehicle and type writers use row locks. Reference validation and type deactivation use the type's row lock, and every write plus its old/new audit entry commits in one database transaction. Existing unique indexes handle duplicate concurrent creations. An audit failure rolls the write back. No physical delete operation is exposed.

## Internal API other services call (not routed by the gateway, needs `x-internal-token`)

- `GET /internal/vehicles/:id?company_id=` returns `{vehicle_id, company_id, vehicle_status, current_driver_id}` (404 if not in that company)
- `GET /internal/stats/vehicles?company_id=` counts by status (for reporting-service)
- `GET /internal/vehicles?company_id=&status=&vehicle_id=&limit=&offset=` one page of a company's vehicles (for reporting-service)

## Data it needs from other services (ask them over `/internal/*`, never their database)

- auth-service (caller identity)
- user-service (driver identity, company, role and account status)
- company-service (selected company exists for Platform Admin creation)

Required environment variables are `DATABASE_URL`, `AUTH_SERVICE_URL`, `USER_SERVICE_URL`, `COMPANY_SERVICE_URL` and `INTERNAL_API_TOKEN`. Docker Compose supplies the internal service URLs.

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Fields keep the Data Dictionary names (snake_case). BIGINT ids are strings in the API.
- Other services' ids (`company_id`, `vehicle_id`, ...) are plain columns without foreign keys.

## Code layout

`src/app.ts` builds the app, `src/config/env.ts` reads env, `src/plugins/guard.ts` gives `authed(...roles)` for protected routes. `src/lib/prisma.ts` is the database client.
Keep routes thin; put rules in a service / use-case file and every database call in a repository file (see `docs/PROJECT_STRUCTURE.md`).

## Verification

`bun test test/vehicles.test.ts` runs the API and Prisma against `DATABASE_URL` for `vehicle_db`. Auth/user/company adapters are injected test doubles. The test creates unique fixture company ids and keeps those records for inspection. It covers roles, company isolation, schemas, duplicates, partial/null updates, inactive references, filters, concurrent writes, internal API compatibility, soft deactivation and audit rollback. Configure this command against the local/test vehicle database.


## Internal dashboard counts

`GET /internal/dashboard/summary?company_id=` requires an internal service token and an explicit valid company id. It returns only company-scoped aggregate counts for Reporting, without pagination or individual personal/GPS records. Database queries live in `src/modules/dashboard/dashboard.repository.ts`. Run `bun test test/dashboard.test.ts` against this service's local database to verify counts beyond 100 records, company isolation, zero counts and the internal guard. Fixtures use unique test-company ids and are retained.
