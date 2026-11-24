# Backend integration

Public clients use the Gateway at `http://localhost:3001/api/v1`. The Next.js BFF calls the same API from inside Compose. The [Gateway route table](../gateway/src/app.ts) forwards active service prefixes on whole path segments. For exact endpoints, see each service's README.

| Prefix | Owning service |
| --- | --- |
| `/auth` | Auth |
| `/companies` | Company |
| `/users` | User |
| `/vehicles`, `/vehicle-types` | Vehicle |
| `/gps-devices` | GPS Device |
| `/gps` | GPS Data |
| `/jobs`, `/driver` | Transport |
| `/routes` | Route History |
| `/alert-rules`, `/geofences`, `/alerts` | Alert |
| `/dashboard`, `/reports` | Reporting |
| `/integrations`, `/integration-logs`, `/system-logs` | Integration |
| `/navigation` | Navigation |

Vehicle Tracking remains a scaffold. Integration can manage API keys and view logs. Gateway enforcement of external integration keys is pending. See [deployment and data ownership](PROJECT_STRUCTURE.md).

## Service contracts

- Validate requests at the owner API. Apply the authenticated tenant and role to each operation. Check any explicit company filter against the caller's permitted scope.
- Access another domain through its public or token-guarded `/internal/*` APIs. Add new internal endpoints to the owner's README and [database guide](DATABASE.md). Keep shared DTOs in `packages/shared-types` and domain logic and Prisma repositories in their owning service.
- Use BIGINT string IDs and canonical field names from the [API contract](API_DATA_CONTRACT.md). Device credentials in `TRACKING_API_TOKENS` currently map to a company and device code. External integration keys have their own scopes.
- Driver GPS ingestion checks that the caller has an assigned, active vehicle and an in-progress job for that vehicle. GPS Data retains both device and server timestamps and a per-device duplicate key. GPS Device DELETE disables the connection while preserving history.
- Gateway bounds upstream time to 12 seconds and forwards the existing application errors. An unavailable upstream gives 502 and an expired upstream deadline gives 504. Gateway does not retry requests. Keep refresh serialized and verify the outcome of a timed-out write before repeating it.
- GPS event push is best-effort. Alert receives events when listed in `GPS_EVENT_SUBSCRIBERS`. Use the stored GPS Data endpoints for reads.

Use [Postman](postman/README.md) for Gateway-level testing and the [database guide](DATABASE.md) for local integration tests that need seeded data or debug ports.
