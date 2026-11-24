# Navigation Service

Stateless road-route preview and address search for signed-in Company Admins, Dispatchers and Drivers in an active workspace. Auth identity and workspace status are checked through auth-service on every request. Platform Admin and GPS device credentials are excluded from this company workflow.

This user-requested service extends the original 12 modules. It owns no database and never reads another service's tables. It calculates automobile routes from selected coordinates. GPS tracking and transport-job persistence belong to their existing services.

## API

- `GET /api/v1/navigation/search?q=...` returns `ApiResponse<NavigationPlace[]>`. Search is an explicit user action. Query length is 2–200 characters and results are limited to five places with a stable OSM identifier, readable label, latitude and longitude. An empty array means the provider found no matches.
- `POST /api/v1/navigation/route` accepts `{origin:{latitude,longitude},destination:{latitude,longitude}}` and returns `ApiResponse<NavigationRoute>`. GeoJSON positions use `[longitude, latitude]`. Distance uses meters, duration uses seconds, and maneuver indices refer to decoded geometry points.

Both routes require a Bearer access token through the Gateway. Extra route properties and invalid coordinates are rejected. Company scope comes from the authenticated identity. No caller-provided provider URL is accepted.

## Providers and limits

| Variable | Default |
| --- | --- |
| `AUTH_SERVICE_URL` | required |
| `INTERNAL_API_TOKEN` | required, server-only |
| `NAVIGATION_GEOCODING_URL` | `https://photon.komoot.io/api/` |
| `NAVIGATION_ROUTING_URL` | `https://valhalla1.openstreetmap.de/route` |

Provider URLs are deployment settings and can point to compatible self-hosted instances. Search terms go to Photon, and endpoint coordinates go to Valhalla. Requests carry no user identity, company identifier, credentials or job payload. Search terms and coordinates are never logged by this service.

Photon's public demo has limited capacity and no availability guarantee. This service bounds cache-miss requests to one per second per provider per process, reuses identical pending requests within a company, and caches successful results in process memory for five minutes. Each provider cache holds at most 100 entries. Provider HTTP 429 responses trigger a ten-second cooldown. Multi-instance production deployments should use a shared limit or dedicated providers.

Requests time out after eight seconds, response bodies are limited to 2 MiB, route geometry to 25,000 points, maneuvers to 2,000, total route distance to 5,000 km and duration to 14 days. Native Valhalla polyline6 is decoded without changing maneuver indices. Failure responses contain sanitized errors and never synthetic straight-line routes.

The routing profile is `auto`. Estimates use the provider's road data. A truck or motorcycle in the UI still receives this automobile preview. Truck-specific dimensions, road restrictions and current traffic require additional configured capabilities. Maneuver instructions use `en-US`, with local road names supplied by the provider. Rendered route/search UI must credit OpenStreetMap, Photon and Valhalla as appropriate.

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 401/403 | auth-service error / `FORBIDDEN` | Missing access or unsupported role/workspace |
| 422 | `VALIDATION_ERROR` | Invalid search or endpoints |
| 422 | `NAVIGATION_NO_ROUTE` | Provider cannot connect the road endpoints or exceeds its route limit |
| 429 | `NAVIGATION_RATE_LIMITED` | Provider request limit or cooldown |
| 502 | `NAVIGATION_INVALID_RESPONSE` | Malformed or oversized provider output |
| 503 | `NAVIGATION_UNAVAILABLE` | Provider network or service failure |
| 504 | `NAVIGATION_TIMEOUT` | Provider exceeded the response deadline |

## Local development and verification

From the repository root, set `AUTH_SERVICE_URL` and `INTERNAL_API_TOKEN` in the process environment, and use `PORT=3014 bun run dev:navigation`. The Gateway defaults to `http://127.0.0.1:3014` for navigation when run directly. Under Compose, call Navigation through the Gateway. The `compose.debug.yaml` override opens localhost port 3014, configurable with `NAVIGATION_PORT`.

```sh
bun test services/navigation-service/test/navigation.test.ts
docker compose up -d --build navigation-service gateway
```

Tests inject provider responses and caller identity, so they run without a database or external network. Live provider checks should use public locations only. Provider references are [Photon](https://github.com/komoot/photon) and the [Valhalla Route API](https://valhalla.github.io/valhalla/api/route/api-reference/).
