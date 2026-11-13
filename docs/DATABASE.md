# PostgreSQL — shared Data Dictionary contract

The source is the project PDF Data Dictionary (pages 6-17). All **14 tables are now implemented** locally through numbered SQL migrations. No additional business tables or columns are invented for GPS persistence. The machine-readable field/type/nullability/default/enum reference is [data-dictionary.json](data-dictionary.json).

| Table | Fields |
| --- | --- |
| `company` | 8 |
| `users` | 10 |
| `vehicle_types` | 7 |
| `vehicles` | 9 |
| `gps_devices` | 12 |
| `gps_locations` | 12 |
| `transport_jobs` | 21 |
| `geofences` | 12 |
| `alert_rules` | 8 |
| `alerts` | 14 |
| `api_integrations` | 12 |
| `api_request_logs` | 10 |
| `system_log` | 11 |
| `auth_sessions` | 9 |

## Migration sequence

- 001_auth.sql: company, users, auth_sessions, system_log.
- 002_align_auth_dictionary.sql: corrects earlier contact/audit name, size and foreign-key mismatches in existing databases without truncating or deleting data.
- 003_fleet_dictionary.sql: adds the remaining ten tables, same-company foreign keys and automatic updated_at triggers. Existing users, sessions and logs remain intact.

For a new Docker volume, the SQL files run in order automatically. For an existing database, run from the repository root in PowerShell, with PostgreSQL running:

```powershell
Get-Content -Raw infra/database/002_align_auth_dictionary.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U vayro -d vayro
Get-Content -Raw infra/database/003_fleet_dictionary.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U vayro -d vayro
```

Migrations can be repeated. Do not use docker compose down -v to upgrade: it deletes the database volume. Migration 002 stops on overlong values or orphan audit references rather than changing/removing them. Migration 003 adds tables and indexes and does not remove existing records. If a table already exists with a different structure, compare its metadata against the manifest and resolve the discrepancy explicitly; do not treat IF NOT EXISTS as a schema-repair tool.

## PostgreSQL adaptations, not new business fields

The PDF permits adapting its example MySQL-style types to the chosen DBMS. We use identity BIGINT for AUTO_INCREMENT, TIMESTAMPTZ for DATETIME, CHECK constraints for enum values, JSONB for JSON, and triggers for ON UPDATE timestamps. Unsigned INT uses BIGINT with a 0..4294967295 CHECK; unsigned SMALLINT (HTTP status) uses INTEGER with a 0..65535 CHECK. GPS direction is further restricted to the documented 0..359 range.

Dictionary same-company rules are enforced with composite foreign keys: vehicle/type/driver, device/vehicle, GPS point/vehicle/device, transport job/vehicle/driver, alert/vehicle/job/geofence/recipient, and request log/integration. Supporting composite unique indexes do not add data fields. Deletion defaults to referential protection, not cascading loss of GPS/history/audit records.

User email is globally unique and normalized to lowercase. Company contact_email UNIQUE remains the selected optional policy previously documented; the PDF lists that constraint as a business choice. Optional vehicle license-plate uniqueness is not added: only the required company/vehicle_code uniqueness is enforced. GPS external_record_id uniqueness is per device, and NULL remains allowed.

## What is ready versus what remains separate

All tables, constraints and timestamp behavior exist. Auth/User and GPS Device/Data currently use PostgreSQL. The Vehicle, Job, Alert/Geofence, Reporting and External Integration APIs are not implemented just because their tables exist. Provider credentials have a database field reserved for encrypted values; GPS APIs reject plaintext credentials and do not connect to real providers. No real maps, APK or hardware are delivered here.

GPS rows already stored in PostgreSQL survive app/container restart. The old in-memory runtime was inspected before replacement and contained zero devices/positions; a private snapshot was saved outside the repository. There was no legacy GPS data requiring an invented vehicle/company mapping.

## Verification

```sh
node services/auth-service/test/migration.mjs
node services/auth-service/test/fleet-schema.mjs
node services/auth-service/test/e2e.mjs
node services/user-service/test/e2e.mjs
docker compose exec -T tracking-service bun test
node services/tracking-service/test/e2e.mjs
```

Tests require local Docker/operator access and use identifiable fixtures. Migration/schema tests create uniquely named test databases and drop only their own databases. HTTP/integration tests retain test rows. The GPS HTTP test restarts Tracking Service to prove persistence. Do not run these fixtures against production.

Verified locally on 2026-11-13:

- Schema migration tests: 73 checks passed, including repeat upgrades, preserved data, all fourteen table definitions, defaults/enums and cross-company references.
- The running database also matches all fourteen manifest field/type/nullability definitions.
- Auth/User HTTP suites: 67 and 54 checks passed; Authentication security unit tests: 5 passed.
- GPS integration: 14 tests / 81 assertions passed; real gateway/container-restart test: 10 checks passed.
- All three Postman collections: 37 requests / 38 collection assertions passed through real HTTP using temporary local fixtures. Scripts were executed by an automated harness, not the Postman desktop UI. Original Tracking settings were restored afterward.
- Auth, User and Tracking TypeScript checks passed. No Frontend or hardware/provider verification was performed.
