# 12. Integration & Logging Service

API keys for external clients (create, rotate, revoke, permissions, rate limit), the API request log, and the system log view.

| | |
| --- | --- |
| Database | `integration_db` (role `integration_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `api_integrations`, `api_request_logs`, `system_log` |
| Gateway prefix | Reserved for future Integration APIs |

## Public endpoints (from the project PDF, pages 18-26)

| Method | Path | Who |
| --- | --- | --- |
| [x] GET | `/api/v1/integrations` (`integration_status`, `company_id` for Platform Admin, `limit`, `offset`) | Company Admin (own company), Platform Admin (read only, any company) |
| [x] GET | `/api/v1/integrations/:id` | same |
| [x] POST | `/api/v1/integrations` `{integration_name, permissions[], rate_limit_per_minute?}` | Company Admin |
| [x] PUT | `/api/v1/integrations/:id` `{integration_name?, permissions?, rate_limit_per_minute?, integration_status?: "active" \| "disabled"}` | Company Admin |
| [x] POST | `/api/v1/integrations/:id/rotate-key` | Company Admin |
| [x] PATCH | `/api/v1/integrations/:id/revoke` | Company Admin |
| [x] GET | `/api/v1/integration-logs` (`integration_id`, `http_method`, `http_status`, `from`, `to`, `limit`, `offset`; `company_id` for Platform Admin) | Company Admin, Platform Admin |
| [x] GET | `/api/v1/system-logs` (`source`, `action` prefix, `from`, `to`, `limit`, `offset`; `company_id` for Platform Admin) | Company Admin (own company), Platform Admin (all) |

`company_id` and `created_by` always come from the signed-in user; bodies with unknown fields are refused (422).

## API keys

- Format `vyr_<8 hex>.<43 characters>`. The full key is returned **once**, as `api_key`, by create and rotate-key. Only a SHA-256 hash of the secret part is stored (`api_key_hash`); the list shows `api_key_prefix` only. The hash is never returned and never logged.
- Allowed `permissions` (read only): `vehicles:read`, `tracking:read`, `gps:read`, `routes:read`, `jobs:read`, `alerts:read`, `reports:read`.
- `rate_limit_per_minute`: 1 to 10 000; when not set the platform default of 60 applies.
- `rotate-key` replaces the key at once (the old one stops working). A `revoked` key is final: it cannot be edited, rotated or reactivated (409 `INTEGRATION_REVOKED`). `disabled` is a reversible switch through `PUT`.
- Create, update, rotate, revoke write `system_log` rows in the same transaction (the key and hash are never part of them).

## Internal API (not routed by the gateway, needs `x-internal-token`)

- `POST /internal/api-keys/verify` `{api_key, permission?}`: the check an external client's request must pass: key exists and matches (401 `INVALID_API_KEY`), not revoked (401 `API_KEY_REVOKED`), not disabled (403 `API_KEY_DISABLED`), company workspace `active` (403 `WORKSPACE_INACTIVE`), permission granted (403 `PERMISSION_DENIED`), rate limit not used up (429 `RATE_LIMITED`). On success: `{integration_id, company_id, permissions, rate_limit: {limit, remaining, reset_at}}`. Each successful call counts against the rate limit. `last_used_at` is refreshed at most once a minute.
- `POST /internal/request-logs` `{integration_id?, company_id, http_method, endpoint, http_status?, duration_ms?, request_id?, source_ip?}`: writes one `api_request_logs` row. The query string is cut from `endpoint`; headers and keys are never accepted.
- `GET /internal/system-logs`: this service's own audit rows.

## System log view

`GET /api/v1/system-logs` merges this service's `system_log` with the ones of **transport-service and alert-service** (they answer `GET /internal/system-logs`), newest first. `meta.sources` lists each as `ok`, `unavailable` or `not_configured`, so a service that is down is visible instead of silently missing. `offset + limit` must not exceed 200. A Company Admin sees only rows of their own company; rows without a company (platform-level actions) are for Platform Admin.

The other services (auth, company, user, vehicle, gps-device) keep their own `system_log` and do not answer `/internal/system-logs`, so their rows are **not** in this view yet. To add one, its owner adds the same small route (see `src/system-logs.ts` here) and a line in `SYSTEM_LOG_SOURCES` (`src/config/env.ts`) points to it; nothing else changes.

## Not done yet (needs the gateway or the team)

- **Nothing calls `verify` or `request-logs` yet.** An external client cannot yet reach the data endpoints with an API key: gateway and services still authenticate people with the access token. Enforcing keys end to end means the gateway verifies `x-api-key` here, applies the permission for the path, and the target service accepts that identity. That changes the gateway and every service's identity handling, so it needs a decision with the team.
- The rate limiter keeps its counters in memory: per process, reset on restart. One instance of this service is assumed.

## Tests

`bun test` runs `test/integration.domain.test.ts` (key generation and matching, permissions, request-log path, rate limiter, log merge).

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Fields keep the Data Dictionary names (snake_case). BIGINT ids are strings in the API.
- Other services' ids (`company_id`, `created_by`, ...) are plain columns without foreign keys.

## Code layout

`src/domain/` pure rules (api-key, rate-limit, system-logs merge), `src/application/verify-key.ts` the verify flow, `src/adapters/` other services, `src/modules/{integrations,logs,internal}/` model, repository, service, routes.
