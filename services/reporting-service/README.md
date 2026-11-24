# 11. Reporting & Dashboard Service

Dashboards and reports per role and workspace (project PDF page 25). **Stores nothing**: every figure is computed when it is asked for, from the services that own the data, over their read-only `/internal` API (no table of its own, as the PDF says for the first phase). Behind the gateway it answers `/api/v1/dashboard/*` and `/api/v1/reports/*`.

## Endpoints

All of them need a signed-in user (auth-service decides who that is). `company_id` always comes from that user; a **Platform Admin** is not tied to a company, so must pass `company_id=` to see one company. Naming another company's id as a company user is `403`; a Platform Admin naming a company that does not exist gets `404` (never a page of zeros).

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /api/v1/dashboard/platform?days=` | Platform Admin | Overview of the whole platform: companies by workspace status, users by role/status, vehicles by status, GPS devices by connection status, jobs and alerts of the last `days` (1-31, default 30) |
| `GET /api/v1/dashboard/company?days=&company_id=` | Company Admin, Dispatcher, Platform Admin (with `company_id`) | One company: vehicles by status, GPS status of the fleet (`current` / `delayed` / `no_data`), devices, jobs, alerts (including how many are still open), and for the Company Admin / Platform Admin also user counts. A Dispatcher gets jobs and vehicle status, **without** user counts |
| `GET /api/v1/reports/vehicles?status=` | Company Admin, Dispatcher, Platform Admin | Each vehicle with its type, status, driver, last known position, GPS status and devices |
| `GET /api/v1/reports/routes?from=&to=&vehicle_id=` | same | Per vehicle: points, approximate distance, average and top speed over the period (default last 24 h) |
| `GET /api/v1/reports/jobs?from=&to=&status=` | same | Transport jobs created in the period (default last 30 days) with a summary by status and the average time completed jobs took |
| `GET /api/v1/reports/alerts?from=&to=&type=&status=` | same | Alerts triggered in the period (default last 30 days), by type and status, how many are open, average time to resolve |
| `GET /api/v1/reports/gps?from=&to=` | same | Quality and status of GPS data per vehicle (default last 24 h): last received, late points, gaps, abnormal points |

Every report takes `page` / `limit` (vehicle-based reports: `limit` up to 100, jobs and alerts up to 200; default 50) and `format=json|csv`. A period is at most **31 days** and must not run backwards (`422`). JSON answers `{ success, data: { summary, rows }, meta: { page, limit, total, pages, generated_at } }`: `rows` is one page, `summary` covers the whole selection.

### CSV export

`format=csv` returns every row of the selection (not just one page) as a download: UTF-8 with a byte-order mark so Excel shows Thai text, CRLF line ends, `Content-Disposition: attachment; filename="report-<name>-<date>.csv"`, `Cache-Control: no-store`. Text that starts with `=`, `+`, `-`, `@` (vehicle codes, job names, addresses, alert titles come from users) gets a leading apostrophe so a spreadsheet cannot run it as a formula. An export over **5000 rows** is refused with `422 TOO_MANY_ROWS`: narrow the filter or the period.

## What the numbers mean

- **GPS status** comes from when the server **last received** data for the vehicle, not from a stored connection flag (PDF page 27): `current` = within 5 minutes, `delayed` = older, `no_data` = nothing stored. Delayed data is never shown as current.
- **Distance** adds up straight-line distances between consecutive stored points of a vehicle and leaves out moves above 250 km/h (a bad fix, not driving). It is an approximation, flagged `distance_is_approximate: true`; a vehicle with no points shows `0` points and `null` speeds, not an invented value.
- **Late points** reached the server more than 5 minutes after they were recorded. **Gaps** are more than 10 minutes without a point. **Anomalies** are (0, 0) positions and moves above 250 km/h from the previous point. Nothing here says anything about engine health: GPS coordinates cannot show it.
- **Windows:** a job belongs to the period it was **created** in, an alert to the period it was **triggered** in, a GPS point to the period it was **recorded** in. `open_total` of alerts counts every alert not resolved, whenever it was triggered.
- `summary.complete: false` means more than 500 vehicles had points, so the totals cover the first 500.

## When another service is down

- **Dashboards** still answer: the part that could not be collected is `{ "available": false, "reason": "alert-service is unavailable" }` instead of a zero that looks real.
- **Reports** fail with `503 UPSTREAM_UNAVAILABLE` rather than return partly wrong numbers.

## Data it asks other services for (never their databases)

Each is a read-only internal endpoint (needs `x-internal-token`, not routed by the gateway); company_id is always the signed-in user's.

| Service | Internal endpoints used |
| --- | --- |
| company-service | `GET /internal/stats/companies` |
| user-service | `GET /internal/stats/users?company_id=` |
| vehicle-service | `GET /internal/stats/vehicles?company_id=`, `GET /internal/vehicles?company_id=&status=&vehicle_id=&limit=&offset=` |
| gps-device-service | `GET /internal/stats/devices?company_id=`, `GET /internal/devices?company_id=&vehicle_ids=` |
| gps-data-service | `GET /internal/locations/latest-by-vehicle?company_id=&vehicle_ids=`, `GET /internal/stats/vehicles?company_id=&from=&to=&vehicle_ids=` |
| transport-service | `GET /internal/stats/jobs?company_id=&from=&to=`, `GET /internal/jobs?company_id=&from=&to=&status=&limit=&offset=` |
| alert-service | `GET /internal/stats/alerts?company_id=&from=&to=`, `GET /internal/alerts?company_id=&from=&to=&type=&status=&limit=&offset=` |

The heavy arithmetic (distance, gaps, anomalies) runs in SQL inside gps-data-service, so this service only receives one row per vehicle.

## Code layout

`src/adapters/sources.ts` (the only place that talks to other services, behind a `Sources` interface), `src/domain/` (pure rules: GPS status, period and company rules, CSV), `src/application/` (`dashboards.ts`, `reports.ts`), `src/routes/` (HTTP only), `src/app.ts` (`createReportingApp({ sources, resolveUser, clock })`: tests replace all three).

## Run and test

Env: `AUTH_SERVICE_URL`, `INTERNAL_API_TOKEN`, `COMPANY_SERVICE_URL`, `USER_SERVICE_URL`, `VEHICLE_SERVICE_URL`, `GPS_DEVICE_SERVICE_URL`, `GPS_DATA_SERVICE_URL`, `TRANSPORT_SERVICE_URL`, `ALERT_SERVICE_URL` (all set in `compose.yaml`).

```sh
docker compose exec -T reporting-service bun test      # 26 tests, other services faked, no database
node services/reporting-service/test/e2e.mjs           # through the gateway; seeds two companies' data in each service's database
```

Not built (not in the PDF list for this service): scheduled reports, e-mailed reports, PDF/Excel files (CSV only), dashboards cached or stored.

## Company totals for the web dashboard

`GET /api/v1/dashboard/company/summary` is for Company Admin only. Auth supplies the current workspace; query parameters, including a caller-selected company, are rejected. The role rules for the platform and date-filtered dashboards are documented above.

Reporting calls `/internal/dashboard/summary?company_id=<authenticated company>` on User, Vehicle and Transport with the internal service token. Each owning service aggregates its own PostgreSQL database with company-scoped queries; Reporting has no database credentials and never reads another service's tables directly. Responses include `company_id`, `generated_at`, and employee/vehicle/job totals with role/status/type breakdowns. Employee totals include Company Admin, Dispatcher and Driver accounts across active/inactive/suspended statuses. Vehicle totals include active/inactive/maintenance records. Job totals include all seven statuses, including completed and cancelled jobs. Counts cover all records, without list pagination or a date filter.

Every source must return a valid, consistent summary for the requested company. A failed source or malformed/mismatched counts produces an error, not a partial set of zeroes. There is no cross-database snapshot transaction. Vehicle status/type counts share a repeatable-read snapshot within vehicle_db. No GPS moving/parked, component health, revenue, or historical metrics are inferred.

The web overview retains its existing floating window. It fetches through Next.js `/api/dashboard/company` and the Gateway with HttpOnly authentication, shows loading/empty/error states, retains the last successful result explicitly on refresh errors, and refreshes on demand, on return/online, and every 30 seconds while visible.

Required environment: `AUTH_SERVICE_URL`, `INTERNAL_API_TOKEN`, `USER_SERVICE_URL`, `VEHICLE_SERVICE_URL`, `TRANSPORT_SERVICE_URL`. Compose already supplies these. Run `bun test test/dashboard.test.ts` for Reporting authorization, parser and source-failure tests. Each owning service also has `test/dashboard.test.ts` against its local database, with unique retained test-company fixtures, covering more than 100 records, tenant isolation, empty summaries and internal authentication.
