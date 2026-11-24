# 2. Company Service

Company workspaces: registration request, Platform Admin approval / rejection / suspension. All 7 endpoints of the PDF are built.

| | |
| --- | --- |
| Database | `company_db` (role `company_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `company` |
| Gateway prefix | `/api/v1/companies` |

## Public endpoints (from the project PDF, pages 18-26)

- [x] `POST /api/v1/companies/register`
- [x] `GET /api/v1/companies` (Platform Admin; `?q=` searches name / contact name / contact e-mail, `?status=`, `?page=`, `?limit=` max 100; newest first; `meta` has page, limit, total, pages)
- [x] `GET /api/v1/companies/:id` (Platform Admin)
- [x] `PUT /api/v1/companies/:id` (Platform Admin; edits `company_name`, `contact_name`, `contact_email`, `contact_phone`; omitted field stays, `null` clears an optional one; the workspace status cannot be changed here)
- [x] `PATCH /api/v1/companies/:id/approve` (pending -> active)
- [x] `PATCH /api/v1/companies/:id/reject` (pending -> rejected; optional body `{reason}` goes to the log)
- [x] `PATCH /api/v1/companies/:id/status` (body `{workspace_status: "active" | "suspended"}`; only active <-> suspended)

Rules (PDF page 19 caution): only the Platform Admin may call these; every change writes a System Log row (`company.update`, `company.approve`, `company.reject`, `company.suspend`, `company.activate`) with old and new values in the same transaction, so a failed log undoes the change. A wrong starting state is `409 INVALID_STATE`; asking for the status the company already has is a harmless 200 with no log row. The row is locked while it changes, so two administrators cannot approve the same request twice. Suspending blocks new sign-ins (auth-service checks the status); it does not revoke sessions that are already open.

Registration (`POST /companies/register`) spans two services and is safe against a lost reply: if creating the first admin gets no answer, company-service looks the admin up before deleting anything (see `docs/DATABASE.md`).

Every endpoint must check Authentication, Role and `company_id` from the signed-in user, never from the request body (PDF page 18).

## Internal API other services call (not routed by the gateway, needs `x-internal-token`)

- `GET /internal/companies/:id` returns `{company_id, workspace_status}`
- `GET /internal/stats/companies` counts of workspaces by status (for reporting-service)

## Data it needs from other services (ask them over `/internal/*`, never their database)

- user-service (create the first Company Admin), auth-service (caller identity)

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Fields keep the Data Dictionary names (snake_case). BIGINT ids are strings in the API.
- Other services' ids (`company_id`, `vehicle_id`, ...) are plain columns without foreign keys.

## Code layout

`src/app.ts` builds the app (`createCompanyApp({ resolveUser })`; tests pass a fake `resolveUser`, production asks auth-service through `src/adapters/auth-service.ts`), `src/config/env.ts` reads env, `src/lib/prisma.ts` is the database client. Protected routes use `authed(...roles)` from `@vayro/service-kit`.
Keep routes thin; put rules in a service / use-case file and every database call in a repository file (see `docs/PROJECT_STRUCTURE.md`).

## Tests

- `DATABASE_URL=<company_db url> bun test` runs `test/*.test.ts` (auth-service is replaced by a fake; fixtures are kept in `company_db`).
- `node services/company-service/test/e2e.mjs` walks the whole life cycle through the gateway on the running Docker stack (register, approve, sign in, suspend, blocked, re-open, reject).
