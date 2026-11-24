# 5. GPS Device Service

GPS devices / data sources of a vehicle and their connection status.

| | |
| --- | --- |
| Database | `gps_device_db` (role `gps_device_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `gps_devices` |
| Gateway prefix | `/api/v1/gps-devices` |

## Provider credentials (PDF page 21: credentials must be encrypted)

`POST` / `PUT` accept a write-only `credentials` object (max 20 keys, 4096 characters as JSON; `null` removes it). It is encrypted with AES-256-GCM (`src/lib/crypto.ts`) using `CREDENTIALS_ENCRYPTION_KEY` (`openssl rand -base64 32`) and stored in `gps_devices.credentials_encrypted`. It is never returned or written to the audit log: responses only carry `has_credentials`. Without the key the service still runs but refuses to save credentials (`503 CREDENTIALS_NOT_CONFIGURED`). Credentials stay separate from `connection_config` (which rejects secrets) and from customers' API keys (integration-service). Keep the key: credentials saved with one key cannot be read with another, and there is no key rotation yet (stored text starts with `v1:` so a new format can coexist). `decryptCredentials` exists for the future provider adapter; no endpoint returns decrypted credentials.

## Public endpoints (from the project PDF, pages 18-26)

- [x] `GET /api/v1/gps-devices`
- [x] `GET /api/v1/gps-devices/:id`
- [x] `POST /api/v1/gps-devices`
- [x] `PUT /api/v1/gps-devices/:id`
- [x] `DELETE /api/v1/gps-devices/:id`
- [x] `GET /api/v1/gps-devices/:id/status`
- [x] `PATCH /api/v1/gps-devices/:id/status` with `{ "enabled": true|false }` for Platform Admin or Company Admin. Changes the receiving status while preserving the device and history, alongside an audit entry when the status changes.

Every endpoint must check Authentication, Role and `company_id` from the signed-in user, never from the request body (PDF page 18).

## Internal API other services call (not routed by the gateway, needs `x-internal-token`)

- `GET /internal/devices/by-code?company_id=&device_code=`
- `POST /internal/devices/:id/received` `{received_at}`
- `GET /internal/stats/devices?company_id=` counts by derived connection status (for reporting-service)
- `GET /internal/devices?company_id=&vehicle_ids=` the devices of a company or of some vehicles (for reporting-service)

## Data it needs from other services (ask them over `/internal/*`, never their database)

- auth-service (caller identity)
- vehicle-service (does the vehicle exist in the company)

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Fields keep the Data Dictionary names (snake_case). BIGINT ids are strings in the API.
- Other services' ids (`company_id`, `vehicle_id`, ...) are plain columns without foreign keys.

## Code layout

`src/app.ts` builds the app, `src/config/env.ts` reads env, `src/plugins/guard.ts` gives `authed(...roles)` for protected routes. `src/lib/prisma.ts` is the database client.
Keep routes thin; put rules in a service / use-case file and every database call in a repository file (see `docs/PROJECT_STRUCTURE.md`).
