# Auth/User + GPS integration review

This branch preserves PR #1's GPS implementation and adds compatibility with the Authentication/User backend. It is a **demo integration branch**, not a claim that GPS Device/Data is complete against the specification. Frontend changes remain local and excluded from all Backend commits.

## What changed

- Resolved `.env.example`, `Dockerfile`, `compose.yaml` conflicts by preserving both sets of services.
- User Service stays on host 3003; Tracking moves to 3004. Gateway exposes auth, users, gps-devices and gps paths on 3001.
- Added Tracking to root `bun.lock`, kept frozen installs and aligned Elysia with the existing backend version.
- Human GPS calls use Authentication's signed session JWT and current database role/company/status. Reused the guard rather than adding an independent user-token verifier.
- Static device credentials remain limited to ingestion. Static admin credentials are rejected; inactive/missing device workspaces are denied.
- GPS responses use the common API envelope. Existing GPS payloads and prototype persistence behavior are retained and documented in `services/tracking-service/README.md`.

## Verification

```sh
docker compose up --build -d --wait postgres auth-service user-service tracking-service gateway
node services/auth-service/test/e2e.mjs
node services/user-service/test/e2e.mjs
docker compose exec -T auth-service bun test test/security.test.ts
docker compose exec -T tracking-service bun test
```

The GPS integration tests create local database fixtures, obtain JWTs from the real Authentication container, exercise device registration/ingestion with an in-process Tracking app, and check HTTP routing through the Gateway/Tracking containers. Tests leave their local test accounts/companies in place. Do not use production data. Backend images are also verified from a clean Git archive to exclude uncommitted local Frontend files.

## Merge guidance

Auth/User is independently backed up in its own branch/PR. The integration branch contains both that work and PR #1, including conflict resolutions. Do not separately apply the original GPS config over the integration config: it uses port 3003 and static user tokens.

Keep the integration PR in draft until the team accepts the GPS demo scope or completes persistent storage, vehicle/company foreign keys, Data Dictionary payload/ID alignment and provider/device lifecycle behavior. No GPS data persistence or real hardware tests are included in this integration change. Main and the original PR remain unchanged while this draft is reviewed.
