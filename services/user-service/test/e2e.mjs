// Uses the local Docker test database. Creates and retains unique test users/companies.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = `${process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"}/api/v1`;
const suffix = randomUUID();
const password = `TestOnly-${suffix}`;
let checks = 0;
function check(name, condition) { assert.ok(condition, name); console.log("PASS", name); checks++; }
async function call(method, path, token, body) {
  const response = await fetch(base + path, { method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, ...(await response.json()) };
}
const psql = q => execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "vayro", "-d", "vayro", "-tAc", q], { cwd: root, encoding: "utf8" }).trim();
async function workspace(label) {
  const email = `${label}-${suffix}@example.test`;
  const registration = await call("POST", "/companies/register", null, { company_name: label, contact_email: email,
    admin_full_name: label, admin_email: email, admin_password: password });
  assert.equal(registration.status, 200);
  const id = registration.data.company_id;
  assert.match(id, /^[0-9]+$/);
  psql(`UPDATE company SET workspace_status='active' WHERE company_id=${id}`);
  const login = await call("POST", "/auth/login", null, { email, password });
  assert.equal(login.status, 200);
  return { id, email, user: login.data.user, token: login.data.access_token };
}
const a = await workspace("user-a");
const b = await workspace("user-b");
const platformEmail = `platform-${suffix}@example.test`;
const bootstrapArgs = ["compose", "exec", "-T", "-e", `ADMIN_EMAIL=${platformEmail}`, "-e", "ADMIN_FULL_NAME=Platform", "-e", `ADMIN_PASSWORD=${password}`, "auth-service", "bun", "scripts/create-platform-admin.ts"];
const bootstrap = execFileSync("docker", bootstrapArgs, { cwd: root, encoding: "utf8" });
check("Operator bootstrap creates first Platform Admin", bootstrap.includes("Platform Admin created"));
let duplicateBootstrapRejected = false;
try { execFileSync("docker", bootstrapArgs, { cwd: root, stdio: "pipe" }); } catch { duplicateBootstrapRejected = true; }
check("Bootstrap cannot overwrite an existing account", duplicateBootstrapRejected);
const platformLogin = await call("POST", "/auth/login", null, { email: platformEmail, password });
const platform = platformLogin.data.access_token;
check("Platform Admin authentication", platformLogin.status === 200);

let r = await call("GET", "/users", platform);
check("Platform Admin lists across workspaces", r.status === 200 && r.data.map(u => u.user_id).join(",") === psql("SELECT string_agg(user_id::text, ',' ORDER BY user_id) FROM (SELECT user_id FROM users ORDER BY user_id LIMIT 50) page"));
r = await call("GET", `/users?company_id=${b.id}`, platform);
check("Platform Admin filters workspace", r.status === 200 && r.data.length === 1 && r.data[0].company_id === b.id);
check("Company Admin cannot override list workspace", (await call("GET", `/users?company_id=${b.id}`, a.token)).status === 403);
check("Cannot list without authentication", (await call("GET", "/users")).status === 401);

const employeeEmail = `employee-${suffix}@example.test`;
const create = { full_name: "Employee", email: employeeEmail, password, role: "driver", company_id: b.id, phone: "0123456789" };
r = await call("POST", "/users", platform, create);
check("Platform Admin creates employee in selected workspace", r.status === 201 && r.data.company_id === b.id && r.data.role === "driver");
const employee = r.data.user_id;
r = await call("GET", `/users/${employee}`, platform);
check("Platform Admin reads target", r.status === 200 && !JSON.stringify(r).includes("password"));
check("Company A cannot read Company B employee", (await call("GET", `/users/${employee}`, a.token)).status === 404);
check("Company A cannot edit Company B employee", (await call("PUT", `/users/${employee}`, a.token, { full_name: "Forbidden" })).status === 404);
check("Company Admin cannot create in another workspace", (await call("POST", "/users", a.token, { ...create, email: `forged-${suffix}@example.test` })).status === 403);
check("Company Admin cannot elevate employee", (await call("PATCH", `/users/${employee}/role`, b.token, { role: "platform_admin" })).status === 403);
check("Platform role requires null company", (await call("POST", "/users", platform, { ...create, role: "platform_admin" })).status === 422);
check("Company role requires company", (await call("POST", "/users", platform, { ...create, company_id: null })).status === 422);
check("Company must exist", (await call("POST", "/users", platform, { ...create, company_id: "9223372036854775807" })).status === 422);
check("Duplicate email conflict", (await call("POST", "/users", platform, create)).status === 409);
for (const invalid of ["", "  ", "x".repeat(151)]) {
  check("Invalid full_name rejected", (await call("PUT", `/users/${employee}`, platform, { full_name: invalid })).status === 422);
}
for (const invalidId of ["0", "01", "-1", "abc", "9223372036854775808"]) {
  check(`Invalid id ${invalidId} rejected`, (await call("GET", `/users/${invalidId}`, platform)).status === 422);
}
for (const query of ["limit=1.5", "offset=0.5", "offset=2147483648", "limit=101"]) {
  check(`Invalid pagination ${query}`, (await call("GET", `/users?${query}`, platform)).status === 422);
}
r = await call("PUT", `/users/${employee}`, platform, { full_name: " Updated ", email: `updated-${suffix}@example.test` });
check("Platform Admin updates name/email and preserves omitted phone", r.status === 200 && r.data.full_name === "Updated" && r.data.phone === "0123456789");
const employeeLogin = await call("POST", "/auth/login", null, { email: r.data.email, password });
const employeeToken = employeeLogin.data.access_token;
check("Updated email can login", employeeLogin.status === 200);
check("Driver cannot administer users", (await call("GET", "/users", employeeToken)).status === 403);
r = await call("PUT", "/users/me", employeeToken, { full_name: "Driver Profile", phone: null, role: "platform_admin", company_id: a.id, account_status: "inactive" });
check("Profile update cannot change role/company/status", r.status === 200 && r.data.role === "driver" && r.data.company_id === b.id && r.data.account_status === "active" && r.data.phone === null);
check("Driver own profile", (await call("GET", "/users/me", employeeToken)).status === 200);
check("Whitespace profile rejected", (await call("PUT", "/users/me", employeeToken, { full_name: "   " })).status === 422);

r = await call("PATCH", `/users/${employee}/role`, platform, { role: "dispatcher" });
check("Platform Admin changes company role", r.status === 200 && r.data.role === "dispatcher" && r.data.company_id === b.id);
check("Cannot relocate company user through role API", (await call("PATCH", `/users/${employee}/role`, platform, { role: "driver", company_id: a.id })).status === 422);
for (const account_status of ["inactive", "active", "suspended", "active"]) {
  r = await call("PATCH", `/users/${employee}/status`, platform, { account_status });
  check(`Platform Admin changes status ${account_status}`, r.status === 200 && r.data.account_status === account_status);
}
check("Suspension revokes existing token even after reactivation", (await call("GET", "/auth/me", employeeToken)).status === 401);
check("Suspension revokes refresh", (await call("POST", "/auth/refresh", null, { refresh_token: employeeLogin.data.refresh_token })).status === 401);
check("Invalid account status rejected", (await call("PATCH", `/users/${employee}/status`, platform, { account_status: "deleted" })).status === 422);
check("Platform Admin cannot change own role", (await call("PATCH", `/users/${platformLogin.data.user.user_id}/role`, platform, { role: "driver", company_id: a.id })).status === 409);
check("Platform Admin cannot suspend self", (await call("PATCH", `/users/${platformLogin.data.user.user_id}/status`, platform, { account_status: "suspended" })).status === 409);

r = await call("POST", "/users", platform, { full_name: "Second Platform", email: `second-${suffix}@example.test`, password, role: "platform_admin", company_id: null });
check("Platform Admin creates another Platform Admin", r.status === 201 && r.data.company_id === null);
const second = r.data.user_id;
r = await call("PATCH", `/users/${second}/role`, platform, { role: "company_admin", company_id: a.id });
check("Platform to company role obeys DD", r.status === 200 && r.data.company_id === a.id && r.data.role === "company_admin");
r = await call("PATCH", `/users/${second}/role`, platform, { role: "platform_admin" });
check("Company to platform role clears company_id", r.status === 200 && r.data.company_id === null);
check("No DELETE beyond document", (await call("DELETE", `/users/${employee}`, platform)).status === 404);
check("Audit captures changes without credentials", psql(`SELECT count(*) FROM system_log WHERE entity_id='${employee}' AND action='user.change_role' AND old_value->>'role'='driver' AND new_value->>'role'='dispatcher'`) === "1");
check("No password/token in user audit", psql(`SELECT count(*) FROM system_log WHERE entity_type='user' AND (old_value::text ~* 'password|token' OR new_value::text ~* 'password|token')`) === "0");
// A fixture trigger rejects only this test user's update audit; always remove it afterward.
const rejectAudit = `test_audit_${suffix.replaceAll("-", "")}`;
const beforeRollback = (await call("GET", `/users/${employee}`, platform)).data.full_name;
psql(`CREATE FUNCTION ${rejectAudit}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER ${rejectAudit} BEFORE INSERT ON system_log FOR EACH ROW WHEN (NEW.entity_id='${employee}' AND NEW.action='user.update') EXECUTE FUNCTION ${rejectAudit}()`);
try {
  r = await call("PUT", `/users/${employee}`, platform, { full_name: "Must roll back" });
  check("Audit failure returns generic error", r.status === 500 && r.error.code === "INTERNAL_ERROR" && r.error.message === "Internal server error");
  check("Audit failure rolls back user modification", (await call("GET", `/users/${employee}`, platform)).data.full_name === beforeRollback);
} finally {
  psql(`DROP TRIGGER ${rejectAudit} ON system_log; DROP FUNCTION ${rejectAudit}()`);
}
console.log(`${checks} User Service checks passed`);
