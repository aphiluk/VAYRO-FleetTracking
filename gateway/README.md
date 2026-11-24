# VAYRO API Gateway

`src/app.ts` maps active public `/api/v1` prefixes to their services. `src/index.ts` starts the Elysia HTTP listener. `GET /` checks whether the Gateway process is responsive. Domain services own authentication checks, permission enforcement, request validation and data access.

Gateway rebuilds forwarding headers and generates `x-request-id`. It relays selected response headers including `cache-control`. Private `/internal/*` routes stay on the service network. Upstream calls have a 12-second deadline and return the standard error envelope on 502 or 504. Gateway issues a single attempt.

```sh
bun run --cwd gateway test
docker compose up --build -d --wait
```

The tests use local stub upstreams. In Compose, call the Gateway on `localhost:3001`. For manual Bun development, set `PORT=3001` and the relevant `*_SERVICE_URL` environment variables, then run `bun run dev:gateway` from the repo root. See the [API prefix list](../docs/INTEGRATION.md).
