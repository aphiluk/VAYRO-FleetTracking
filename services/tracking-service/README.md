# GPS Device / GPS Data Service

PostgreSQL-backed Elysia/Bun service using the PDF Data Dictionary. Human requests use Authentication JWTs with live session/role/workspace checks; device credentials are scoped to a registered device and active company. Every stored point references a real same-company vehicle/device.

Read [the shared database contract](../../docs/DATABASE.md) and [API data contract](../../docs/API_DATA_CONTRACT.md) before connecting a client. The schema includes all 14 tables; only the implemented services expose APIs.

## Run

Apply migrations 002 and 003 to an existing database as documented, then from the root:

```sh
docker compose up --build -d --wait postgres auth-service user-service tracking-service gateway
docker compose exec -T tracking-service bun test
node services/tracking-service/test/e2e.mjs
```

Gateway base: http://localhost:3001/api/v1. Direct local Tracking port: 3004. All BIGINT values are JSON strings.

Device credential environment format (secret token is a placeholder, never a live credential):

```json
{"<private-random-token-at-least-24-chars>":{"role":"gps_device","company_id":"<existing-company-id>","device_code":"<registered-device-code>"}}
```

Set this JSON locally as TRACKING_API_TOKENS and recreate Tracking to load it. A device token may only ingest its registered device in its active company. It cannot list/manage devices. Human/static admin tokens in this config are rejected. Login JWTs can administer/read devices by role; Driver JWTs can ingest driver_mobile_app points only for their assigned active vehicle with an in_progress assigned job.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /gps-devices | Scoped list, optional company_id for Platform Admin, limit 1-500, offset |
| GET | /gps-devices/:id | Scoped details; excludes credentials_encrypted |
| POST | /gps-devices | Company/Platform Admin; real vehicle_id string, device_code, source_type; 201 |
| PUT | /gps-devices/:id | Update permitted settings; cannot move across companies |
| DELETE | /gps-devices/:id | Disable connection (200), retaining the device and all history |
| GET | /gps-devices/:id/status | Derived connection status and last_received_at |
| POST | /gps/ingest | Device credential or assigned Driver; canonical GPS payload; 201 |
| GET | /gps/vehicles/:vehicleId/locations | Stored positions in time order, from/to, limit 1-500 |
| GET | /gps/vehicles/:vehicleId/latest | Latest by recorded_at, deterministic GPS ID tie-break |

Ingest body:

```json
{"device_code":"test-device","external_record_id":"point-001","recorded_at":"2026-11-13T09:00:00Z","latitude":13.7563,"longitude":100.5018,"speed_kmh":35.12,"direction_degree":120,"accuracy_meters":8}
```

This is synthetic test data. Optional sensor/external-ID fields may be null or omitted. No engine-health data is inferred. Company/vehicle/device IDs for ingest are resolved from the credential/assignment, never trusted from its body. Legacy speed_kph/heading/accuracy_m fields are rejected with 422 rather than silently stored under different names.

Implementation timing policies (the PDF leaves thresholds to configuration/design): GPS age over five minutes is delayed; source times more than 30 seconds in the future are rejected. History defaults to the last 24 hours and accepts ordered ranges up to 31 days. Device status uses last server receipt, not an assertion that a vendor is online.

Ingest inserts the position and updates the device in one transaction. Device/external_record_id uniqueness persists across processes and restart. Device administration and audit commit atomically. Provider secrets are rejected in connection_config; accepting/encrypting provider credentials and real provider integrations remain separate work.
