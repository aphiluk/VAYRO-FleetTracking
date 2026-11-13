# User Service — Backend handoff

Implements the eight User Service endpoints in PDF pages 19-20, with `users`, `company`, `system_log` from the Data Dictionary. It reuses Authentication's `auth_sessions` check when validating access tokens. No frontend or extra domain endpoints are included.

## Run and test

From the repository root, with `.env` configured:

```sh
docker compose up --build -d --wait postgres auth-service user-service gateway
node services/auth-service/test/e2e.mjs
node services/user-service/test/e2e.mjs
```

Tests create and retain local test accounts. User tests also create a narrowly scoped audit-failure trigger and remove it in a finally block. Do not run against production. Verified: 58 Authentication E2E checks, 54 User E2E checks, 5 Authentication unit tests, strict TypeScript checks.

Clients call `http://localhost:3001/api/v1` with `Authorization: Bearer <access_token>`. Login first using the four [Authentication endpoints](AUTH.md). Docker also exposes the local User Service at port 3003. [Postman collections](postman/README.md) cover Company Admin and Platform Admin separately.

## Permissions and contract

| Method and path | Permission | Request / behavior |
| --- | --- | --- |
| GET `/users` | Platform Admin / Company Admin | `limit` integer 1-100, default 50; `offset` integer 0-2147483647, default 0. Optional `company_id` filter; Company Admin cannot select another company. Platform Admin can list all workspaces. |
| GET `/users/:id` | Platform Admin / Company Admin | Platform Admin can read any user; Company Admin reads own workspace only. |
| POST `/users` | Platform Admin / Company Admin | `full_name`, `email`, `password`, `role`; optional `company_id`, `phone`. Returns **201**. |
| PUT `/users/:id` | Platform Admin / Company Admin | `full_name` required; `email`, `phone` optional. Omitted phone/email are preserved; `phone:null` or an empty phone clears it. |
| PATCH `/users/:id/role` | Platform Admin / Company Admin | `role`; Platform Admin may supply `company_id` when giving a company role to a Platform Admin. Self role changes return 409. |
| PATCH `/users/:id/status` | Platform Admin / Company Admin | `account_status`: active / inactive / suspended. Self changes return 409. Non-active revokes all target sessions atomically. Reactivating does not restore old tokens. |
| GET `/users/me` | All four roles | Own profile only. |
| PUT `/users/me` | All four roles | Same profile fields as PUT by id; cannot modify own company, role or account status through this endpoint. |

Company Admin's `company_id` always comes from the authenticated database identity. Attempting to supply another company or grant Platform Admin returns 403. Targeting another company's user by id returns 404. Platform Admin is the only role allowed to manage platform privileges.

Dictionary rule: `platform_admin` must have `company_id:null`; all other roles need an existing company. A Platform Admin creating a company user must explicitly select its `company_id`. When promoting to Platform Admin, company_id becomes null. When changing an existing Platform Admin to a company role, provide company_id. A company user's existing workspace cannot be reassigned via this API; that would require handling related domain data outside this module's scope.

`full_name` must contain non-whitespace text, max 150 characters. Email: valid format, max 150, normalized to lowercase, globally unique. Phone: max 30. Password on create: 10-128, Argon2id only. IDs are positive BIGINT **strings** with no leading zero and within PostgreSQL's range. Invalid data returns 422; duplicate email 409; missing/invalid/revoked token 401; insufficient role 403.

Success: `{success:true,data,message,request_id}`; errors: `{success:false,error:{code,message,details?},request_id}`. Profiles return `user_id`, `company_id`, `full_name`, `email`, `role`, `phone`, `account_status`; never password hashes or tokens. POST is 201; other successful operations are 200. There is no DELETE or password-reset endpoint in the assigned specification.

## First Platform Admin (operator setup only)

There is no public Platform Admin signup endpoint. An operator with database/container access runs this once. Example in PowerShell 7:

```powershell
$env:ADMIN_EMAIL = Read-Host 'Admin email'
$env:ADMIN_FULL_NAME = Read-Host 'Admin full name'
$env:ADMIN_PASSWORD = Read-Host 'Admin password (10-128 chars)' -MaskInput
docker compose exec -T -e ADMIN_EMAIL -e ADMIN_FULL_NAME -e ADMIN_PASSWORD auth-service bun scripts/create-platform-admin.ts
Remove-Item Env:ADMIN_PASSWORD
```

The command hashes the password, sets company_id NULL and role platform_admin, and records `user.bootstrap` atomically. An existing email is rejected, never overwritten or elevated. Credentials must remain local, not in `.env.example`, Postman exports or Git. Company creation/approval is a separate module; workspace setup is not added to User Service.

## Audit and dictionary compatibility

All User API mutations and their `system_log` entry commit or roll back together. Old/new values contain only safe profile/role/status fields as JSON objects. Passwords, hashes, tokens and Authorization headers are never included. Historical logs written by the earlier version as JSON strings are retained unchanged.

The existing PostgreSQL schema already has the required fields, lengths, roles, statuses, identity PKs, user/company FK and role/company CHECK constraint. There is no schema reset or extra user table. `updated_at` is set by the update statements, corresponding to the dictionary's automatic update timestamp.
