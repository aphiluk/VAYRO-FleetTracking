# User Service

Elysia + Bun backend implementing all eight `/api/v1/users` endpoints (Platform Admin management, Company Admin workspace isolation, own-profile access). Owns `users` and its own `system_log` in `user_db` (Prisma). Whether a company exists is asked from company-service. It also serves other services over `/internal/*`: password check at login, user lookup, and creating a new company's first admin.

Read [the User API handoff](../../docs/USER.md) for endpoint payloads, Data Dictionary mapping, first-admin setup, permissions and tests. [Postman collections](../../docs/postman/README.md) cover both administrator roles.

Run from the repository root:

```sh
docker compose up --build -d --wait postgres auth-service user-service gateway
node services/user-service/test/e2e.mjs
```

The Gateway endpoint is `http://localhost:3001/api/v1/users`. The debug Compose override opens localhost port 3003 for direct-service tests. User verifies callers through Auth using `INTERNAL_API_TOKEN` and `AUTH_SERVICE_URL` and reads workspace details via `COMPANY_SERVICE_URL`. It uses `packages/service-kit` from this monorepo.

Closing an account ends its sessions (retried); re-opening one ends the old sessions first and is refused with `503 SESSION_REVOKE_FAILED` if that cannot be done, so a re-opened account always signs in again. `POST /internal/users` is idempotent and `GET /internal/users/lookup` lets company-service check before it undoes a registration.

First Platform Admin: `docker compose exec -T -e ADMIN_EMAIL -e ADMIN_FULL_NAME -e ADMIN_PASSWORD user-service bun scripts/create-platform-admin.ts`.

For reporting-service it also offers `GET /internal/stats/users?company_id=` (counts of users by role and by status; without `company_id` the whole platform).

## Internal dashboard counts

`GET /internal/dashboard/summary?company_id=` requires an internal service token and an explicit valid company id. It returns only company-scoped aggregate counts for Reporting, without pagination or individual personal/GPS records. Database queries live in `src/modules/dashboard/dashboard.repository.ts`. Run `bun test test/dashboard.test.ts` against this service's local database to verify counts beyond 100 records, company isolation, zero counts and the internal guard. Fixtures use unique test-company ids and are retained.
