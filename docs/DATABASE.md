# PostgreSQL: one database per service, managed with Prisma

The field contract is still the project PDF Data Dictionary: [data-dictionary.json](data-dictionary.json) lists every field, and [API_DATA_CONTRACT.md](API_DATA_CONTRACT.md) lists how it appears in the API. What changed is **who owns each table**. The PDF (page 7) describes 12 service modules; each module that owns data has its own database and its own login role **with its own password** on the one Postgres server. A service cannot connect to another service's database, and no service knows the admin password (`POSTGRES_PASSWORD`): `compose.yaml` gives each service only its own `DB_PASSWORD_<SERVICE>` inside its `DATABASE_URL`. Only the postgres container sees all of them.

| # | Service | Database / role | Tables it owns |
| --- | --- | --- | --- |
| 1 | auth-service | `auth_db` / `auth_svc` | `auth_sessions`, `system_log` |
| 2 | company-service | `company_db` / `company_svc` | `company`, `system_log` |
| 3 | user-service | `user_db` / `user_svc` | `users`, `system_log` |
| 4 | vehicle-service | `vehicle_db` / `vehicle_svc` | `vehicle_types`, `vehicles`, `system_log` |
| 5 | gps-device-service | `gps_device_db` / `gps_device_svc` | `gps_devices`, `system_log` |
| 6 | gps-data-service | `gps_data_db` / `gps_data_svc` | `gps_locations` |
| 7 | tracking-service | none | Planned read API over GPS Data |
| 8 | route-history-service | none | Planned read API over GPS Data |
| 9 | transport-service | `transport_db` / `transport_svc` | `transport_jobs`, `system_log` |
| 10 | alert-service | `alert_db` / `alert_svc` | `alert_rules`, `geofences`, `alerts`, `system_log`, `vehicle_signal_state` |
| 11 | reporting-service | none | Composes User, Vehicle and Transport summary APIs |
| 12 | integration-service | `integration_db` / `integration_svc` | `api_integrations`, `api_request_logs`, `system_log` |
| 13 | navigation-service | none | Address search and route previews |

Each service's schema is in `services/<name>/prisma/schema.prisma`; the same 14 Data Dictionary tables exist, spread over these databases.

## What this means for the code

- **No cross-service joins or foreign keys.** `gps_devices.vehicle_id`, `users.company_id`, `vehicles.current_driver_id`, `transport_jobs.driver_id`, `auth_sessions.user_id`, `alerts.vehicle_id` and similar are plain BIGINT values. The owning service answers "does it exist" over HTTP. Inside one service (for example `alerts.geofence_id`) a foreign key remains.
- **Service-to-service calls use `/internal/*`**, guarded by `INTERNAL_API_TOKEN`. The gateway never proxies `/internal/*`.
  - auth-service: `GET /internal/introspect` (validate a bearer token), `POST /internal/sessions/revoke`
  - company-service: `GET /internal/companies/:id`
  - user-service: `POST /internal/credentials/verify`, `GET /internal/users/:id`, `POST /internal/users`
  - vehicle-service: `GET /internal/vehicles/:id?company_id=`
  - gps-device-service: `GET /internal/devices/by-code`, `POST /internal/devices/:id/received`
  - gps-data-service: `GET /internal/locations/latest`, `GET /internal/locations`, `GET /internal/locations/latest-by-vehicle`, `GET /internal/stats/vehicles`
  - transport-service: `GET /internal/jobs/in-progress`, `GET /internal/stats/jobs`, `GET /internal/jobs`
  - read-only figures for reporting-service: `GET /internal/stats/companies` (company), `GET /internal/stats/users` (user), `GET /internal/stats/vehicles` + `GET /internal/vehicles` (vehicle), `GET /internal/stats/devices` + `GET /internal/devices` (gps-device), `GET /internal/stats/alerts` + `GET /internal/alerts` (alert)
  - user-service, vehicle-service and transport-service: `GET /internal/dashboard/summary?company_id=`
- **`system_log` is kept per service.** The PDF has one `system_log` table; here every service that writes audit events keeps its own copy (same columns, no foreign keys) so a change and its audit row commit in one transaction. integration-service has the table too and is where `GET /api/v1/system-logs` is built; collecting the others' logs for that view is left to its owner (each service can expose its log over `/internal/*`).
- **Company registration spans two services.** company-service creates the company, then asks user-service to create the first Company Admin. Because "no answer" does not mean "not done", a failed create is never trusted by itself: company-service first looks the admin up (`GET /internal/users/lookup`). Found: the company is kept and registration succeeds. Not found: the company is deleted and the original error returned (the client may retry). Cannot tell (user-service unreachable): the company is kept as `pending` and the answer is `503 REGISTRATION_UNCONFIRMED`, because deleting it could orphan an admin; a platform admin cleans such a case up. `POST /internal/users` is idempotent: the same e-mail already being that company's admin returns 200, never a second account.
- **Same-company rules** that used to be composite foreign keys are now checked by the code through those internal calls.
- **Known gaps:** the database no longer stops user-service from moving a driver out of a company while a vehicle still points at that driver (add the check when vehicle-service gets its public API); a GPS point that arrives while its device is being disabled can still be stored; a failed "device received data" update is only logged (device status is derived from `last_received_at`, so the next point repairs it).
- **Session revoke is retried, and re-opening an account depends on it.** Closing an account (inactive/suspended) commits first, then user-service asks auth-service to end the user's sessions (3 tries). The user is blocked either way, because auth-service checks status on every request and refresh. Re-opening an account ends the old sessions first (3 tries) and, if auth-service still cannot be reached, refuses the change (`503 SESSION_REVOKE_FAILED`, nothing changed). So a missed revoke can never bring an old session back to life: a re-opened account always has to sign in again.

## Prisma workflow

Field names stay snake_case so database rows match the public API. BIGINT columns are Prisma `BigInt`; the API turns them into strings. Status/role columns are Prisma enums (Postgres enum types). Rules Prisma cannot express (CHECK constraints such as coordinate ranges, `email = lower(email)`) are written by hand at the end of the migration SQL.

```sh
# change services/<name>/prisma/schema.prisma, then create a migration against a dev database
cd services/<name>
DATABASE_URL=postgres://<db>_svc:<password>@localhost:5432/<db>_db bunx prisma migrate dev --name what_changed
bun run db:generate        # regenerate the client (src/generated is not committed)
```

Containers run `prisma migrate deploy` automatically before the server starts (`bun run start`), so a new migration is applied on the next `docker compose up --build`. The Docker image runs `prisma generate` at build time. A new service with a database also needs its name added to `infra/database/init/01-create-databases.sh`.

## New install

`docker compose up --build -d --wait` on an empty volume creates the nine databases and roles (`infra/database/init/01-create-databases.sh`), then each service creates its tables from its migration. Copy `.env.example` to `.env` first and replace the secrets: `INTERNAL_API_TOKEN`, one `DB_PASSWORD_<SERVICE>` per database (nine, all different: `openssl rand -hex 24`), and `CREDENTIALS_ENCRYPTION_KEY` if GPS provider credentials will be stored.

## Existing install: move data out of the old shared database

Do not run `docker compose down -v`: it deletes the volume. The old database is only read, never changed or dropped, so it stays as a backup. Run from the repository root with the current stack up. First add `INTERNAL_API_TOKEN` and the nine `DB_PASSWORD_*` values to `.env` (see `.env.example`). If an earlier version already created the databases with the shared password, the second command also switches each role to its own password; then recreate the services (`docker compose up -d --build`) so they pick it up:

```sh
docker compose up -d --wait postgres
docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-create-databases.sh
docker compose up --build -d --wait
docker compose exec -T postgres sh < infra/database/split-legacy.sh
```

In Git Bash on Windows, prefix the second command with `MSYS_NO_PATHCONV=1` to preserve the Linux path. In PowerShell, run the fourth command as `cmd.exe /d /c "docker compose exec -T postgres sh < infra\database\split-legacy.sh"` so the script reaches the container's stdin. Before starting, save a dump of the legacy database with `pg_dump` in the git-ignored `backups/` directory. The dump contains password hashes.

For every table the script copies the source rows the new database does not have yet (matched on the primary key; a row already there is never overwritten), then checks that **every** source row is present. A table that was only partly copied is completed, not skipped; a row that cannot be copied (for example its e-mail already belongs to a different row) is reported as `MISSING` and the script exits 1. It keeps ids, moves the sequences past the copied ids, and leaves rows the services wrote later alone, so running it again at any time is safe. Old audit rows are split by action prefix (`auth.*`, `company.*`, `user.*`, `gps_device.*`; anything else goes to `integration_db`). Between the third and fourth command the new databases are empty: users cannot sign in until the copy finishes, so do it in one sitting.

The earlier numbered SQL migrations are kept in `infra/database/legacy/` for reference only; nothing runs them any more.

## Verification

```sh
docker compose exec -T auth-service bun test test/security.test.ts
docker compose exec -T -e DATABASE_URL=postgres://gps_device_svc:<password>@postgres:5432/gps_device_db gps-device-service bun test
docker compose exec -T -e DATABASE_URL=postgres://gps_data_svc:<password>@postgres:5432/gps_data_db gps-data-service bun test
node services/auth-service/test/e2e.mjs
node services/user-service/test/e2e.mjs
node services/gps-data-service/test/e2e.mjs
```

The HTTP tests need the running stack and keep uniquely named test rows. Start it with `docker compose -f compose.yaml -f compose.debug.yaml up --build -d --wait` for Auth E2E, which checks Auth and User directly. The gps-device and gps-data integration tests replace the other services with in-memory fakes, so they only need their own database. Run these checks on a development database.

Verified locally on 2026-11-15 on a separate Compose project holding a copy of the real data (60 companies, 119 users, 193 sessions, 568 log rows, 13 vehicles, 6 jobs, 15 devices, 23 positions): all 12 services and the gateway became healthy; the copy matched row counts per table (audit rows 347 + 46 + 149 + 26 = 568) and was skipped on a second run; auth e2e 70 checks, user e2e 54, gps-data e2e 14 (includes a real container restart and encrypted provider credentials through the gateway), gps-device 16 tests, gps-data 20 tests, auth security 5, all passed; a registration whose admin e-mail already existed returned 409 and left no company behind; `gps_data_svc` was refused a connection to `user_db`; `/internal/*` returned 401 without the token and 404 through the gateway. Type checks passed for all services, the kit and the gateway. Not re-run: the Postman collections and the web app.
