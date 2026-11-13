# Shared API data contract

The PDF Data Dictionary is the business-field source. `data-dictionary.json` lists all fourteen table columns, PostgreSQL types, nullability, status defaults and enum values. `packages/shared-types/index.ts` exports the implemented Auth/User and GPS request/response types for client developers. New service APIs must use the same business names; do not invent a second spelling for the same stored value.

## Common representation

- Every BIGINT ID is a JSON **string**, including company_id, vehicle_id, gps_device_id and gps_location_id. This also applies to TRACKING_API_TOKENS company_id; it is not companyId and is not a JavaScript number. IDs above 2^53 are tested without rounding.
- Timestamps are ISO 8601 UTC strings, stored as TIMESTAMPTZ. recorded_at is measured by the source; received_at is assigned by PostgreSQL. Never replace the measured timestamp with the arrival time.
- GPS latitude, longitude, speed and accuracy are JSON numbers, stored with the dictionary's NUMERIC precision/scale. Missing optional sensor values are null, not fabricated zeros.
- Success uses `{success:true,data,message,request_id}`. Errors use `{success:false,error:{code,message,details?},request_id}`. Creation is 201; normal reads/updates are 200; malformed/invalid data is 400/422; unauthenticated is 401; unauthorized is 403; missing scoped rows are 404; duplicates/referenced rows are 409.
- Company/role authority comes from Authentication/credential lookup, never from a user-selected body field. PostgreSQL foreign keys also reject relationships that cross company boundaries.

## GPS names changed to match the document

| Old prototype | Canonical contract |
| --- | --- |
| `id` (UUID for a GPS point) | `gps_location_id` (BIGINT string) |
| `speed_kph` | `speed_kmh` |
| `heading` | `direction_degree` (integer 0-359) |
| `accuracy_m` | `accuracy_meters` |
| numeric company/vehicle/device ID | string BIGINT ID |
| credential `companyId`, `deviceIdentifier` | credential `company_id`, `device_code` |

Legacy payloads are rejected; there is no hidden alias that could make two developers store different fields. The credential's device_code resolves the actual GPS device and vehicle. Ingest does not accept company_id or vehicle_id in the body. Duplicate external_record_id is scoped to gps_device_id, length 100; null is allowed.

Driver mobile uses the existing Login JWT plus a registered driver_mobile_app device, a matching current_driver_id and an in_progress job for that driver/vehicle. No additional phone/GPS tracking permission is implied outside an active assigned job. No job-creation endpoint or real mobile APK is introduced in this work.

Provider credential handling is intentionally closed: the database has credentials_encrypted, but public GPS responses exclude it and plaintext credentials/settings keys are rejected. A future real-provider adapter must implement encrypted storage and should not change the dictionary schema or expose secrets.

## Ready for other developers

All fourteen tables are ready as a shared schema. Vehicle/Job/Alert/Geofence/External Integration service owners can implement against their documented columns and relations. Having those tables does not claim their REST APIs or business workflows are built. Use DATABASE.md for safe migration commands and Postman README for local test setup. No frontend-to-database access or database credentials belong in browser code.

## Implementation choices to share with the team

The PDF does not prescribe every wire format or operational limit. The following are project choices, not additional Data Dictionary fields:

- BIGINT IDs are JSON strings, including in device credential configuration. PostgreSQL type adaptations are listed in DATABASE.md.
- Company contact_email is unique (a policy the dictionary permits choosing); two workspaces cannot reuse it. User emails are globally unique and normalized to lowercase.
- Access JWTs default to 15 minutes and Refresh Tokens to 7 days. Password creation requires 10-128 characters. Refresh rotates tokens and invalidates the previous access token; replay of a revoked but unexpired refresh token revokes that user's sessions. See AUTH.md for details and configurable TTLs.
- Driver mobile points require a registered driver_mobile_app source, its assigned active vehicle and an in_progress job. This implements the repository's active-work-session privacy requirement.
- Device credentials are configured server-side separately from Login JWTs. They can ingest only their registered device; they cannot administer devices or act as external Integration API keys.
- GPS older than 5 minutes is marked delayed; source timestamps over 30 seconds ahead are rejected. History defaults to 24 hours, permits at most 31 days per request and limits results to 500. These values are implementation policies.
- Connection cancellation uses the boolean connection_config.disabled key described below. Provider credential encryption/storage workflows are not exposed by the current API.

The old GPS prototype's field names, numeric IDs and credential configuration are incompatible with this contract. Other developers must update those callers; passing Backend tests does not verify an untested Frontend or provider client.

## Connection cancellation

The document defines GPS DELETE as cancellation/disconnection. The endpoint therefore retains the row/history, sets connection_status to disconnected and persists a boolean disabled=true in the existing free-form connection_config JSON. This operational JSON key is our implementation of cancellation, not an extra table column prescribed by the PDF. Ingest checks it transactionally after locking the device. An authorized administrator may reconnect using PUT with connection_config.disabled=false (preserve any other needed settings). A server/app restart cannot silently re-enable a closed device.
