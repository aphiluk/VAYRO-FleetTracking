# 10. Alert & Geofence Service

Alert rules, circular geofences, and the alerts raised from GPS points and job events.

| | |
| --- | --- |
| Database | `alert_db` (role `alert_svc`), Prisma schema in `prisma/schema.prisma` |
| Owns tables | `alert_rules`, `geofences`, `alerts`, `system_log`, plus `vehicle_signal_state` (operational state, not a Data Dictionary table) |
| Gateway prefix | see `gateway/src/app.ts` |

## Public endpoints (from the project PDF, pages 18-26)

| Method | Path | Who |
| --- | --- | --- |
| [x] GET | `/api/v1/alert-rules` | Company Admin, Dispatcher |
| [x] POST | `/api/v1/alert-rules` `{rule_type, threshold_value, is_enabled?}` | Company Admin |
| [x] PUT | `/api/v1/alert-rules/:id` `{threshold_value, is_enabled?}` | Company Admin |
| [x] PATCH | `/api/v1/alert-rules/:id/status` `{is_enabled}` | Company Admin |
| [x] GET | `/api/v1/geofences` (`geofence_status`, `limit`, `offset`) | Company Admin, Dispatcher |
| [x] POST | `/api/v1/geofences` | Company Admin |
| [x] PUT | `/api/v1/geofences/:id` | Company Admin |
| [x] PATCH | `/api/v1/geofences/:id/status` `{geofence_status}` | Company Admin |
| [x] DELETE | `/api/v1/geofences/:id` (409 `GEOFENCE_IN_USE` when alerts refer to it: deactivate instead) | Company Admin |
| [x] GET | `/api/v1/alerts` (`alert_status`, `alert_type`, `vehicle_id`, `job_id`, `from`, `to`, `limit`, `offset`) | Company Admin, Dispatcher: all of the company. Driver: only alerts addressed to them |
| [x] GET | `/api/v1/alerts/:id` | same visibility |
| [x] PATCH | `/api/v1/alerts/:id/read` | Company Admin, Dispatcher, Driver (own) |
| [x] PATCH | `/api/v1/alerts/:id/handling` | Company Admin, Dispatcher |
| [x] PATCH | `/api/v1/alerts/:id/resolve` | Company Admin, Dispatcher |

`company_id` always comes from the signed-in user. One rule per type per company (`UNIQUE(company_id, rule_type)`, 409 `RULE_EXISTS`).

## Rules and policies

- Thresholds: `gps_offline` is minutes (1 to 1440), `overspeed` is km/h (above 0, at most 400). Geofence radius 1 to 500 000 m.
- **Where events come from:** gps-data-service pushes each stored point to `POST /internal/gps/locations` when `GPS_EVENT_SUBSCRIBERS=http://alert-service:3000` is set in `.env` (it is in `.env.example`). Delivery is fire-and-forget: a point lost while this service is down raises no alert.
- Only a **current** point without anomalies (`freshness = "current"`, empty `anomalies`) moves the vehicle's position or raises overspeed / geofence alerts, and only if it is newer than the last one used. Delayed points (an offline queue flushed later) and bad fixes are never presented as where the vehicle is now.
- **Overspeed:** speed above the company's enabled rule. A reported speed of `null` never counts.
- **Geofence enter/exit:** transitions between consecutive usable points, per active geofence, honouring `notify_enter` / `notify_exit`. The first usable point of a vehicle only sets its starting position (no "entered" alert). A geofence that is switched off or deleted is never reported as left.
- **GPS offline:** a timer (`OFFLINE_SCAN_SECONDS`, default 60) checks vehicles this service has heard from and raises one alert per silence after the company's threshold. It starts again only after the vehicle reports. When transport-service ends a vehicle's job, the check is paused for that vehicle until it reports again, so a phone that stops with the job does not raise alerts. A vehicle silent for more than 7 days is treated as retired. Assumes **one instance** of this service.
- **No duplicates:** the same alert (vehicle + type + title) is not raised again while an earlier one is still open and recent (overspeed and abnormal-data 10 minutes, offline 60 minutes). Processing is serialized per vehicle.
- Alert states: `unread -> read -> handling -> resolved`. `read` never moves an alert backwards (no error when it is already further along); `handling` and `resolve` are refused with 409 once resolved. `handling` and `resolve` are written to `system_log`.
- Alerts created by other services: `job_assignment` (to the driver) and `system_anomaly` (job problem) from transport-service; `system_anomaly` titled "GPS data anomaly" from abnormal GPS data.

## Internal API (not routed by the gateway, needs `x-internal-token`)

- `POST /internal/gps/locations` `{event: "gps_location.stored", location}` (from gps-data-service)
- `POST /internal/alerts` `{company_id, alert_type: "job_assignment" | "system_anomaly", title, detail?, vehicle_id?, job_id?, recipient_user_id?, event_data?}` (from transport-service)
- `POST /internal/signal/pause` `{company_id, vehicle_id}` (from transport-service)
- `GET /internal/system-logs` this service's audit rows (integration-service)
- `GET /internal/stats/alerts?company_id=&from=&to=` alerts triggered in the window by type and status, how many are open, average time to resolve (reporting-service)
- `GET /internal/alerts?company_id=&from=&to=&type=&status=&limit=&offset=` one page of a company's alerts (reporting-service)

## Tests

`bun test` runs `test/alerts.domain.test.ts` (distance, geofence transitions, speed, offline, thresholds, alert states). Event handling and the offline timer run against the database and are exercised through Postman and by sending points to `/api/v1/gps/ingest`.

## Data layer

- Edit `prisma/schema.prisma`, then create a migration: `DATABASE_URL=... bunx prisma migrate dev --name what_changed` (see `docs/DATABASE.md`).
- Migration `20261118000000_audit_log_and_signal_state` adds `system_log` (same columns as every other service) and `vehicle_signal_state`.
- `geofences` -> `alerts.geofence_id` is a real foreign key inside this service. `company_id`, `vehicle_id`, `job_id`, `recipient_user_id`, `created_by`, `handled_by` are plain columns.

## Code layout

`src/domain/alerts.ts` pure rules; `src/application/` event processing and the offline scan; `src/infrastructure/` signal-state repository; `src/modules/{rules,geofences,alerts,internal}/` model, repository, service, routes.
