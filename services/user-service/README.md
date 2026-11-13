# User Service

Elysia + Bun backend implementing all eight `/api/v1/users` endpoints: Platform Admin management, Company Admin workspace isolation, and own-profile access for all roles.

Read [the User API handoff](../../docs/USER.md) for endpoint payloads, Data Dictionary mapping, first-admin setup, permissions and tests. [Postman collections](../../docs/postman/README.md) cover both administrator roles.

Run from the repository root:

```sh
docker compose up --build -d --wait postgres auth-service user-service gateway
node services/user-service/test/e2e.mjs
```

Gateway URL stays `http://localhost:3001/api/v1/users`; local service port is 3003. The service reuses Authentication's DB/guard/http/security helpers. Build both from this monorepo with the same database and JWT secret; do not deploy this folder alone.