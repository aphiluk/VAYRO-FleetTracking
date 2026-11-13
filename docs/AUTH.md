# Authentication Service

Implemented in `services/auth-service`, reached through the gateway (`/api/v1/...`). Tables: `infra/database/001_auth.sql`.
User endpoints now run separately in `services/user-service`, reached through the same gateway URLs. Company registration remains an existing adjacent module in auth-service.

## Data Dictionary mapping (PDF pages 7-8, 17-18)

| Table | Fields used by Authentication | Rules |
| --- | --- | --- |
| `users` | `user_id`, `company_id`, `full_name`, `email`, `password_hash`, `role`, `phone`, `account_status` | Email unique across the platform; Argon2id password. `platform_admin` has NULL company; other roles require a company. |
| `company` | `company_id`, `workspace_status` | Company accounts require an active workspace. Pending, suspended and rejected are denied. |
| `auth_sessions` | `session_id`, `user_id`, `refresh_token_hash`, `expires_at`, `revoked_at`, `last_used_at`, `ip_address`, `user_agent`, `created_at` | Refresh secret stored as SHA-256 only; FK to users; unique hash; index `(user_id, expires_at)`. |

PostgreSQL uses identity BIGINT instead of AUTO_INCREMENT, TIMESTAMPTZ instead of DATETIME, and CHECK constraints instead of MySQL ENUM. IDs are JSON strings to preserve BIGINT precision. `system_log` records audit events without credentials. See [database scope, implementation decisions and safe migration](DATABASE.md): the PDF has 14 tables; Auth/User implements four. Existing databases should apply `002_align_auth_dictionary.sql` to fix earlier contact/audit dictionary mismatches without resetting data.

## Verification

```sh
docker compose up --build -d --wait postgres auth-service user-service gateway
docker compose exec -T auth-service bun test test/security.test.ts
node services/auth-service/test/e2e.mjs
node services/user-service/test/e2e.mjs
node services/auth-service/test/migration.mjs
```

Verified on Docker (Bun 1.3.14 + PostgreSQL 17): 5 unit tests, 67 Authentication E2E checks and 54 User E2E checks. Covers all roles, workspace/account status, session expiry/revocation, parallel refresh, authorization, tenant isolation and transactional audit rollback. Tests create and retain accounts; use a local development database only. Set `GATEWAY_URL`, `AUTH_URL`, `USER_URL` if host ports differ. See [User Service contracts and operator bootstrap](USER.md).

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

The following describes a previously tested local prototype, not a Frontend delivered by the Backend branch. Frontend files remain uncommitted locally and are excluded from this change. The committed APIs can be tested independently with Postman.

Pages: `/login`, `/register`, `/dashboard` (any signed-in user), `/users` (Company Admin only). `/` redirects by session.

- The browser never calls the gateway. Server Actions and Server Components call it with `API_URL` (Compose: `http://gateway:3000`).
- Tokens live in httpOnly cookies `vayro_at` (access, 15 min) and `vayro_rt` (refresh, 7 days). Set `COOKIE_SECURE=true` when served over HTTPS.
- An expired access token sends the page through `GET /session/refresh?next=...`, which rotates the refresh token and redirects back. Nav links use `prefetch={false}` because a background prefetch must not trigger a rotation (a reused rotated token revokes all sessions).
- Role checks in the UI only hide links; the API enforces role and company on every call.
- Verified in the in-app browser on Docker: register, login (error keeps the email), dashboard, create user, change role/status, logout, refresh route (including replay and `next=//evil.test`).

## Not done / known limits

- No rate limiting or lockout on login (spec lists 429 for API clients).
- Approve/reject company is a separate Company module. For local tests, activate a test company with SQL. Operator-only Platform Admin setup is documented in [USER.md](USER.md).
- Dispatcher/Driver have no admin permissions here; their domain permissions come with the vehicle/job services.
- Gateway supplies `x-forwarded-for` for audit metadata. Local clients can also reach the localhost-only service ports, so this metadata is not an authorization source.
- Platform Admin pages are not built. Registered companies stay `pending` until SQL (or a future Platform Admin screen) activates them.
- No page for the user's own profile edit (`PUT /users/me` exists in the API).
- The e2e test needs the Docker stack and leaves its test companies/users in the database; it is not a unit test suite.

Migration verification: 13 checks passed for rollback, preservation, exact dictionary fields and repeatability; see DATABASE.md.
