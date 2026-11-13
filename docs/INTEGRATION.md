# Auth/User + PostgreSQL GPS integration

The integration branch combines Auth/User with the original GPS contribution and replaces its in-memory persistence with PostgreSQL. All 14 Data Dictionary tables exist. This is a Backend integration for team review; it does not implement all service modules or real GPS provider adapters.

- Auth/User, Gateway and GPS Device/Data share PostgreSQL identities, company isolation and session checks.
- User runs on 3003, Tracking on 3004, Gateway on 3001.
- GPS uses canonical field names and BIGINT strings, validates real vehicle ownership, persists duplicate checks/history and survives Tracking restart.
- Migration 003 adds ten tables and same-company constraints; no old rows are deleted.
- Frontend files are untouched by this task. Other services have table foundations but their APIs are not implemented.

## Before connecting another service or Frontend

- Apply migrations 002 and 003 to an existing database; never delete its volume to upgrade. New databases initialize automatically.
- Use BIGINT string IDs and canonical GPS fields. The old prototype payloads and static user tokens are rejected.
- Device credentials use TRACKING_API_TOKENS with company_id and device_code; they are separate from user Login JWTs and future external Integration API keys.
- Driver mobile ingestion requires an assigned active vehicle and an in_progress assigned transport job. Vehicle/Job APIs are not included; local tests prepare fixtures through SQL.
- GPS DELETE disables the connection while retaining data. The disabled flag in connection_config and timing/query policies are implementation choices documented in the shared contract.
- Auth/User refresh rotates tokens: serialize refresh and never retry a consumed token automatically. Use the shared Auth guard for other protected Backend APIs.

See [DATABASE.md](DATABASE.md) for validation results and migrations, [API_DATA_CONTRACT.md](API_DATA_CONTRACT.md) for representation/policy choices, and [Postman instructions](postman/README.md) for API testing. Frontend and real-provider/hardware integration still need their own end-to-end verification. Publishing this branch does not merge it into main.
