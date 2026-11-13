# Authentication Service

Elysia + Bun backend for `/api/v1/auth/login`, `/logout`, `/refresh` (POST) and `/me` (GET).
Uses the Data Dictionary tables `users`, `company`, `auth_sessions`; user management runs separately in `services/user-service`.

From the repository root:

```sh
docker compose up --build -d --wait postgres auth-service user-service gateway
docker compose exec -T auth-service bun test test/security.test.ts
node services/auth-service/test/e2e.mjs
```

Use a local development database for E2E tests (they create and retain test accounts).
See [the authentication guide](../../docs/AUTH.md) for payloads, dictionary mapping, session policies and known limits.
Local Bun development requires `DATABASE_URL`, `JWT_SECRET` (at least 32 characters) and `PORT=3002` before `bun run dev:auth` at the root.
