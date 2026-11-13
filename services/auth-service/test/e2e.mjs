// End-to-end auth test. Needs: `docker compose up -d --wait postgres auth-service user-service gateway`.
// Run from the repo root: `node services/auth-service/test/e2e.mjs`.
// It creates throwaway companies/users (unique per run) and activates them with SQL via `docker compose exec`.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BASE = `${process.env.GATEWAY_URL ?? "http://127.0.0.1:3001"}/api/v1`;
let fails = 0;
const sfx = Date.now();
const PW = "TestPass-" + sfx; // throwaway test value

async function call(method, path, { body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
function check(name, cond, extra) {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + JSON.stringify(extra)}`);
}
const psql = (q) => execSync(`docker compose exec -T postgres psql -U vayro -d vayro -tAc "${q}"`, { encoding: "utf8", cwd: REPO_ROOT }).trim();

// register
const adminEmail = `admin${sfx}@a.test`;
let r = await call("POST", "/companies/register", { body: { company_name: "Co A", contact_email: `c${sfx}@a.test`, admin_full_name: "Admin A", admin_email: adminEmail, admin_password: PW } });
check("register 200", r.status === 200 && r.json?.data?.workspace_status === "pending", r);
const coA = r.json?.data?.company_id;
r = await call("POST", "/companies/register", { body: { company_name: "Co A", contact_email: `c${sfx}@a.test`, admin_full_name: "x", admin_email: `o${sfx}@a.test`, admin_password: PW } });
check("register dup contact_email 409", r.status === 409, r);
r = await call("POST", "/companies/register", { body: { company_name: "", contact_email: "bad", admin_full_name: "x", admin_email: "y", admin_password: "short" } });
check("register invalid 422", r.status === 422, r);

// login blocked while pending
r = await call("POST", "/auth/login", { body: { email: adminEmail, password: PW } });
check("login pending workspace 403", r.status === 403 && r.json?.error?.code === "WORKSPACE_NOT_ACTIVE", r);
r = await call("POST", "/auth/login", { body: { email: adminEmail, password: "wrong-password" } });
check("login wrong pw 401", r.status === 401 && r.json?.error?.code === "INVALID_CREDENTIALS", r);
r = await call("POST", "/auth/login", { body: { email: "nobody@a.test", password: "whatever-pass" } });
check("login unknown email 401 (same error)", r.status === 401 && r.json?.error?.code === "INVALID_CREDENTIALS", r);

psql(`UPDATE company SET workspace_status='active' WHERE company_id=${coA}`);

r = await call("POST", "/auth/login", { body: { email: adminEmail.toUpperCase(), password: PW } });
check("login ok (case-insens email)", r.status === 200 && r.json?.data?.access_token && r.json?.data?.refresh_token, r.status);
const t1 = r.json?.data;
check("login no password_hash leaked", !JSON.stringify(r.json).includes("password"), null);

r = await call("GET", "/auth/me", { token: t1.access_token });
check("me 200 company_admin", r.status === 200 && r.json?.data?.role === "company_admin", r);
r = await call("GET", "/auth/me");
check("me no token 401", r.status === 401, r);
r = await call("GET", "/auth/me", { token: t1.access_token.slice(0, -2) + "xx" });
check("me tampered token 401", r.status === 401, r);

// refresh rotation
r = await call("POST", "/auth/refresh", { body: { refresh_token: t1.refresh_token } });
check("refresh ok", r.status === 200 && r.json?.data?.refresh_token && r.json.data.refresh_token !== t1.refresh_token, r.status);
const t2 = r.json?.data;
r = await call("POST", "/auth/refresh", { body: { refresh_token: t1.refresh_token } });
check("reuse old refresh 401", r.status === 401, r);
r = await call("POST", "/auth/refresh", { body: { refresh_token: t2.refresh_token } });
check("reuse detection killed new session too 401", r.status === 401, r);

r = await call("POST", "/auth/login", { body: { email: adminEmail, password: PW } });
const t3 = r.json.data;
const adminTok = t3.access_token;

// user mgmt
const dEmail = `disp${sfx}@a.test`;
r = await call("POST", "/users", { token: adminTok, body: { full_name: "Disp", email: dEmail, password: PW, role: "dispatcher" } });
check("create dispatcher 201", r.status === 201 && r.json?.data?.role === "dispatcher" && r.json.data.company_id === coA, r);
const dId = r.json?.data?.user_id;
r = await call("POST", "/users", { token: adminTok, body: { full_name: "P", email: `p${sfx}@a.test`, password: PW, role: "platform_admin" } });
check("company admin cannot create platform_admin 403", r.status === 403, r.status);
r = await call("POST", "/users", { token: adminTok, body: { full_name: "Disp", email: dEmail, password: PW, role: "driver" } });
check("dup email 409", r.status === 409, r);
r = await call("GET", "/users", { token: adminTok });
check("list users (2)", r.status === 200 && r.json.data.length === 2, r);
r = await call("GET", "/users/me", { token: adminTok });
check("users/me not captured by :id", r.status === 200 && r.json?.data?.email === adminEmail, r);

// dispatcher cannot manage users
r = await call("POST", "/auth/login", { body: { email: dEmail, password: PW } });
const dTok = r.json?.data?.access_token;
check("dispatcher login", r.status === 200, r);
r = await call("GET", "/users", { token: dTok });
check("dispatcher list users 403", r.status === 403, r);
r = await call("PUT", "/users/me", { token: dTok, body: { full_name: "Disp New", phone: "0812345678" } });
check("dispatcher edits own profile", r.status === 200 && r.json?.data?.full_name === "Disp New", r);

// tenant isolation
r = await call("POST", "/companies/register", { body: { company_name: "Co B", contact_email: `c${sfx}@b.test`, admin_full_name: "Admin B", admin_email: `admin${sfx}@b.test`, admin_password: PW } });
const coB = r.json.data.company_id;
psql(`UPDATE company SET workspace_status='active' WHERE company_id=${coB}`);
r = await call("POST", "/auth/login", { body: { email: `admin${sfx}@b.test`, password: PW } });
const bTok = r.json.data.access_token;
r = await call("GET", `/users/${dId}`, { token: bTok });
check("B cannot read A's user 404", r.status === 404, r);
r = await call("PATCH", `/users/${dId}/role`, { token: bTok, body: { role: "company_admin" } });
check("B cannot change A's user role 404", r.status === 404, r);
r = await call("PATCH", `/users/${dId}/status`, { token: bTok, body: { account_status: "suspended" } });
check("B cannot suspend A's user 404", r.status === 404, r);
r = await call("GET", "/users", { token: bTok });
check("B list only own (1)", r.json?.data?.length === 1, r);

// self protection + role/status change
r = await call("PATCH", `/users/${t3.user.user_id}/role`, { token: adminTok, body: { role: "driver" } });
check("admin cannot change own role 409", r.status === 409, r);
r = await call("PATCH", `/users/${dId}/role`, { token: adminTok, body: { role: "driver" } });
check("change role to driver", r.status === 200 && r.json.data.role === "driver", r);
r = await call("GET", "/users", { token: dTok });
check("role change takes effect on live token (still 403)", r.status === 403, r);

// suspend -> immediate effect + sessions revoked
const dLogin = await call("POST", "/auth/login", { body: { email: dEmail, password: PW } });
r = await call("PATCH", `/users/${dId}/status`, { token: adminTok, body: { account_status: "suspended" } });
check("suspend user", r.status === 200, r);
r = await call("GET", "/auth/me", { token: dLogin.json.data.access_token });
check("suspended user's live token 403", r.status === 403, r);
r = await call("POST", "/auth/refresh", { body: { refresh_token: dLogin.json.data.refresh_token } });
check("suspended user's refresh 401", r.status === 401, r);
r = await call("POST", "/auth/login", { body: { email: dEmail, password: PW } });
check("suspended login 403", r.status === 403 && r.json?.error?.code === "ACCOUNT_INACTIVE", r);

// suspend workspace -> admin token dies
psql(`UPDATE company SET workspace_status='suspended' WHERE company_id=${coB}`);
r = await call("GET", "/auth/me", { token: bTok });
check("suspended workspace token 403", r.status === 403, r);

// logout
r = await call("POST", "/auth/logout", { body: { refresh_token: t3.refresh_token } });
check("logout 200", r.status === 200, r);
r = await call("GET", "/auth/me", { token: t3.access_token });
check("logout invalidates access token immediately", r.status === 401, r.status);
r = await call("POST", "/auth/refresh", { body: { refresh_token: t3.refresh_token } });
check("refresh after logout 401", r.status === 401, r);

// Independent sessions: logout must not end another device's session.
const deviceA = (await call("POST", "/auth/login", { body: { email: adminEmail, password: PW } })).json.data;
const deviceB = (await call("POST", "/auth/login", { body: { email: adminEmail, password: PW } })).json.data;
await call("POST", "/auth/logout", { body: { refresh_token: deviceA.refresh_token } });
check("other device survives logout", (await call("GET", "/auth/me", { token: deviceB.access_token })).status === 200);
check("logout idempotent", (await call("POST", "/auth/logout", { body: { refresh_token: deviceA.refresh_token } })).status === 200);

// Replaying simultaneously must revoke even the winning rotation, not leave a live token behind.
const racing = await Promise.all([1, 2].map(() => call("POST", "/auth/refresh", { body: { refresh_token: deviceB.refresh_token } })));
check("one concurrent refresh wins", racing.filter(x => x.status === 200).length === 1 && racing.filter(x => x.status === 401).length === 1, racing.map(x => x.status));
const winner = racing.find(x => x.status === 200)?.json.data;
if (winner) {
  check("concurrent replay revokes winner access", (await call("GET", "/auth/me", { token: winner.access_token })).status === 401);
  check("concurrent replay revokes winner refresh", (await call("POST", "/auth/refresh", { body: { refresh_token: winner.refresh_token } })).status === 401);
}

// All four roles can authenticate; company-less platform admin uses the DD rule.
const storedHash = psql(`SELECT password_hash FROM users WHERE email='${adminEmail}'`);
const platformEmail = `platform${sfx}@a.test`;
const platformId = psql(`INSERT INTO users (full_name,email,password_hash,role) VALUES ('Platform','${platformEmail}','${storedHash}','platform_admin') RETURNING user_id`).split("\n")[0].trim();
const platform = await call("POST", "/auth/login", { body: { email: platformEmail, password: PW } });
check("platform_admin login without company", platform.status === 200 && platform.json?.data.user.company_id === null, platform.status);
check("platform_admin me", (await call("GET", "/auth/me", { token: platform.json.data.access_token })).status === 200);
psql(`UPDATE users SET account_status='inactive' WHERE user_id=${platformId}`);
check("inactive platform admin denied", (await call("GET", "/auth/me", { token: platform.json.data.access_token })).status === 403);

psql(`UPDATE users SET account_status='active' WHERE user_id=${dId}`);
const driver = await call("POST", "/auth/login", { body: { email: dEmail, password: PW } });
check("driver login", driver.status === 200 && driver.json?.data.user.role === "driver", driver.status);
check("driver me", (await call("GET", "/auth/me", { token: driver.json.data.access_token })).status === 200);
psql(`UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=${dId} AND revoked_at IS NULL`);
check("expired session access denied", (await call("GET", "/auth/me", { token: driver.json.data.access_token })).status === 401);
check("expired refresh denied", (await call("POST", "/auth/refresh", { body: { refresh_token: driver.json.data.refresh_token } })).status === 401);

for (const state of ["pending", "rejected", "suspended"]) {
  psql(`UPDATE company SET workspace_status='${state}' WHERE company_id=${coA}`);
  const denied = await call("POST", "/auth/login", { body: { email: adminEmail, password: PW } });
  check(`${state} workspace cannot login`, denied.status === 403 && denied.json?.error.code === "WORKSPACE_NOT_ACTIVE", denied.status);
}
psql(`UPDATE company SET workspace_status='active' WHERE company_id=${coA}`);

const directAuth = process.env.AUTH_URL ?? "http://127.0.0.1:3002";
check("user routes removed from Authentication Service", (await fetch(directAuth + "/api/v1/users/me")).status === 404);
check("user-service health", (await fetch(`${process.env.USER_URL ?? "http://127.0.0.1:3003"}/`)).ok);

// gateway allowlist + malformed
r = await call("GET", "/vehicles");
check("gateway blocks unknown path 404", r.status === 404, r);
const raw = await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
check("malformed JSON 4xx not 500", raw.status >= 400 && raw.status < 500, raw.status);

// audit & secrets
console.log("audit actions:", psql("SELECT action||':'||result||'x'||count(*) FROM system_log GROUP BY action,result ORDER BY 1").replace(/\n/g, " | "));
check("audit has no tokens/password", psql("SELECT count(*) FROM system_log WHERE new_value::text ~* 'password|token' OR old_value::text ~* 'password|token'") === "0", null);
check("stored refresh tokens hashed", psql(`SELECT count(*) FROM auth_sessions WHERE refresh_token_hash='${t3.refresh_token}'`) === "0", null);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
