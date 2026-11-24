# Authentication Service

Implemented in `services/auth-service`, reached through the gateway (`/api/v1/...`). Tables: `auth_sessions` and `system_log` in `auth_db` (Prisma, see [DATABASE.md](DATABASE.md)); users belong to user-service and companies to company-service.
User endpoints run in `services/user-service` and company registration in `services/company-service`, reached through the same gateway URLs. Login asks user-service to check the password and company-service for the workspace status.

## Data Dictionary mapping (PDF pages 7-8, 17-18)

| Table | Fields used by Authentication | Rules |
| --- | --- | --- |
| `users` | `user_id`, `company_id`, `full_name`, `email`, `password_hash`, `role`, `phone`, `account_status` | Email unique across the platform; Argon2id password. `platform_admin` has NULL company; other roles require a company. |
| `company` | `company_id`, `workspace_status` | Company accounts require an active workspace. Pending, suspended and rejected are denied. |
| `auth_sessions` | `session_id`, `user_id`, `refresh_token_hash`, `expires_at`, `revoked_at`, `last_used_at`, `ip_address`, `user_agent`, `created_at` | Refresh secret stored as SHA-256 only. User ID references the User service. Unique hash and index on `(user_id, expires_at)`. |

PostgreSQL uses identity BIGINT, TIMESTAMPTZ and CHECK constraints to represent the PDF's examples. IDs are JSON strings. The dictionary tables live in databases owned by their services. For upgrades from the legacy shared database, see [the database migration guide](DATABASE.md) and [the API contract](API_DATA_CONTRACT.md).

## Verification

```sh
docker compose -f compose.yaml -f compose.debug.yaml up --build -d --wait
docker compose exec -T auth-service bun test test/security.test.ts
node services/auth-service/test/e2e.mjs
node services/user-service/test/e2e.mjs
```

Verified on Docker (Bun 1.3.14 + PostgreSQL 17, per-service databases, 2026-11-15): 5 unit tests, 68 Authentication E2E checks and 54 User E2E checks. Covers all roles, workspace/account status, session expiry/revocation, parallel refresh, authorization, tenant isolation and transactional audit rollback. Tests create and retain accounts; use a local development database only. Set `GATEWAY_URL`, `AUTH_URL`, `USER_URL` if host ports differ. See [User Service contracts and operator bootstrap](USER.md).

## Endpoints

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/companies/register` | public | Creates workspace (`pending`) + first Company Admin. Cannot sign in until a Platform Admin sets `workspace_status='active'` |
| POST | `/api/v1/auth/login` | public | `{email, password}` → access + refresh token + user |
| POST | `/api/v1/auth/refresh` | refresh token | Rotates: old token is revoked, new pair issued |
| POST | `/api/v1/auth/logout` | refresh token | Revokes that session and its access token immediately; idempotent; other devices stay signed in |
| GET | `/api/v1/auth/me` | any signed-in | |
| GET / PUT | `/api/v1/users/me` | any signed-in | PUT edits own `full_name`, optional `email`, `phone` |
| GET | `/api/v1/users` | platform_admin / company_admin | Platform-wide or own company; `?limit=1-100&offset=&company_id=` |
| GET | `/api/v1/users/:id` | platform_admin / company_admin | Company Admin targeting another company → 404 |
| POST | `/api/v1/users` | platform_admin / company_admin | 201; Platform Admin can create all roles with dictionary company rules |
| PUT | `/api/v1/users/:id` | platform_admin / company_admin | `full_name`, optional `email`, `phone` |
| PATCH | `/api/v1/users/:id/role` | platform_admin / company_admin | Not on self; only Platform Admin can grant platform role |
| PATCH | `/api/v1/users/:id/status` | platform_admin / company_admin | Not on self; non-active revokes target sessions atomically |

Send `Authorization: Bearer <access_token>`. Responses use `{success, data, message, request_id}`; errors use `{success:false, error:{code,message,details?}, request_id}`.

## Rules

- Company Admin queries are filtered by the caller's company_id from the database. Platform Admin explicitly has platform-wide access. User changes and audit entries commit atomically.
- The guard re-reads the user on every request, so suspending a user or workspace applies immediately.
- Access token: HS256 JWT, 15 min (`ACCESS_TOKEN_TTL_SECONDS`), with `sub`, `sid` (dictionary `session_id`), `role`, `cid`, `iat`, `exp`. Every protected call checks the session plus the current role/status and workspace in PostgreSQL. Tokens without `sid` require a new login after upgrade.
- Refresh token: 256-bit random, stored as SHA-256, 7 days (`REFRESH_TOKEN_TTL_SECONDS`). Rotation consumes the old session and inserts the new one in a transaction, also invalidating the old access token. A user row lock serializes rotations so simultaneous replay revokes the winning replacement. Re-using a revoked token that has not expired revokes all of that user's sessions, including other devices; never automatically retry refresh. Expired refresh tokens always return 401 without revoking other sessions. TTL values must be integers between 1 and 31536000 seconds.
- Passwords: argon2id via `Bun.password`, 10-128 characters on create/register.
- Audit rows go to `system_log`: login success/failure, logout, register, user create/update/role/status. No passwords or tokens.

## Web (apps/web)

Start PostgreSQL, Auth and Gateway through Compose (`docker compose up -d --build --wait postgres company-service user-service auth-service gateway`). Open `/login` with an active Company Admin, Dispatcher or Driver account in an active workspace. For a fresh local database, use `POST /api/v1/companies/register` to create a test workspace and its Company Admin, then activate the test workspace in the local `company_db` database. See [DATABASE.md](DATABASE.md) for existing installs.

- Next.js calls the Gateway from the server using `API_URL` (Compose: `http://gateway:3000`, local default: `http://127.0.0.1:3001`).
- Login stores `vayro_at` and `vayro_rt` as HttpOnly, SameSite=Lax cookies for the access token lifetime. `vayro_rt` is used for logout. When the access token expires, sign in again. Set `COOKIE_SECURE=true` on HTTPS deployments and `COOKIE_SECURE=false` when running a local production build over plain HTTP.
- The Dashboard checks `/api/v1/auth/me` and displays the signed-in name and role. Company Admin can use TestRole to preview the Dispatch interface. Backend authorization applies to protected API calls.
- The employee web login routes Company Admin and Dispatcher to `/dashboard`, and Driver to `/driver`. The Driver page verifies the session and role through the Gateway, displays the signed-in name/email/workspace id, and offers logout. Dashboard requests from a Driver redirect to `/driver`; company dashboard users visiting `/driver` return to their Dashboard. Owner and Platform Admin pages are pending.
- Driver login uses a real database account created by an authorized administrator through `POST /api/v1/users` with role `driver`. Driver jobs and job-state changes use Transport through the Gateway, with database persistence. The home page derives work notices from assigned jobs. Road routes use Navigation previews without live GPS. Test credentials are generated at provision time and are never committed.
- Sign out from the Dashboard profile menu or More page, or the fourth item in the Driver bottom menu. The Driver menu also appears in the expanded map sheet. Its logout button is disabled while submitting. The web clears both cookies and asks Auth to revoke the session.
- The `/register` form calls `POST /api/v1/companies/register` through the Gateway and shows a pending confirmation. It uses the first admin's name and email as the company contact. The workspace must be activated before the admin can sign in.
- The Dashboard map layouts default to real company vehicle registrations and Transport problem reports. Vehicle details show the permanent driver and assigned job. Missing GPS is labelled unavailable and no simulated position is assigned to a real vehicle; the separate demo toggle enables the simulated fleet. The Company Admin overview counts employee accounts, vehicles and transport jobs from the owning databases through Reporting and Gateway, scoped to the authenticated company. Vehicle management and transport jobs use real company-scoped APIs; the User API is available independently and the Add Employee invitation form is still a demo.

## Not done / known limits

- No rate limiting or lockout on login (spec lists 429 for API clients).
- Approve/reject company is a separate Company module. For local tests, activate a test company with SQL. Operator-only Platform Admin setup is documented in [USER.md](USER.md).
- Dispatcher/Driver have no admin permissions here; their domain permissions come with the vehicle/job services.
- Gateway supplies `x-forwarded-for` for audit metadata. Authorization uses authenticated identity and domain permissions. The debug Compose override opens direct service ports on localhost.
- Platform Admin pages are not built. Registered companies stay `pending` until SQL (or a future Platform Admin screen) activates them.
- No page for the user's own profile edit (`PUT /users/me` exists in the API).
- The e2e test needs the Docker stack and leaves its test companies/users in the database; it is not a unit test suite.

Migration verification: 13 checks passed for rollback, preservation, exact dictionary fields and repeatability; see DATABASE.md.
