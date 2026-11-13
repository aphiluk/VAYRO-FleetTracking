# PostgreSQL scope and dictionary mapping

Source: the project PDF Data Dictionary, pages 6-17. It defines **14 tables**, using relational/MySQL-style example types that may be adapted to the selected DBMS. PostgreSQL is the project's selected database; the PDF is a design, not an already-built database.

Implemented tables: **company, users, auth_sessions, system_log**. Not created by Auth/User: vehicle_types, vehicles, gps_devices, gps_locations, transport_jobs, geofences, alert_rules, alerts, api_integrations, api_request_logs. The integration branch's GPS demo still uses in-memory device/location storage.

## Requirements versus implementation decisions

- The four table names, business fields, role/status values, lengths, foreign keys and recommended indexes come from the dictionary. `company.contact_name` is VARCHAR(100). Audit key is `system_log_id`; action is VARCHAR(120), entity_type VARCHAR(80), entity_id VARCHAR(80), with company/user foreign keys.
- PostgreSQL adaptation: identity BIGINT for AUTO_INCREMENT, TIMESTAMPTZ for DATETIME, CHECK for enum values, JSONB for JSON. Update statements maintain updated_at. IDs are JSON strings to preserve BIGINT precision.
- The dictionary requires globally unique user emails; lowercasing plus a lowercase CHECK is our enforcement method. Company contact_email UNIQUE is a selected business policy that the PDF explicitly lists as optional.
- Argon2id, SHA-256 refresh hashes, HS256 JWT and token lifetimes are implementation choices. The document requires hashing and revocable sessions but does not prescribe those exact algorithms/lifetimes.

## Updating existing databases safely

001_auth.sql initializes the four tables on a new volume. Earlier versions had contact_name length 150, audit key log_id, different audit varchar lengths and missing audit foreign keys. 002_align_auth_dictionary.sql corrects existing databases without deleting rows or truncating values.

Run from the repository root (PowerShell):

```powershell
Get-Content -Raw infra/database/002_align_auth_dictionary.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U vayro -d vayro
```

The migration locks affected tables inside one transaction. Overlong values or orphan references make it stop without applying changes. Resolve identified rows explicitly before retrying; no automatic cleanup is done. Repeated execution is safe. **Do not update schema with `docker compose down -v`: that deletes the database volume.**

```sh
node services/auth-service/test/migration.mjs
```

The migration test creates uniquely named test databases, verifies rollback, original-row preservation, dictionary fields/keys, repeatability and fresh initialization, then removes only those test databases. It requires local operator access.
