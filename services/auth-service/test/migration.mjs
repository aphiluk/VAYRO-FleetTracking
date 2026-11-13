// Local Docker only. Creates uniquely named fixture databases and removes only those databases.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const init = readFileSync(new URL("../../../infra/database/001_auth.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../infra/database/002_align_auth_dictionary.sql", import.meta.url), "utf8");
const prefix = `vayro_auth_test_${randomUUID().replaceAll("-", "")}`;
const created = [];
let checks = 0;
function check(name, value) { assert.ok(value, name); console.log("PASS", name); checks++; }
function run(db, query) {
  return execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "vayro", "-d", db, "-tA"],
    { cwd: root, input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function rejected(db, message) {
  let error;
  try { run(db, migration); } catch (e) { error = e; }
  check(message, error?.stderr?.includes("Migration stopped:"));
  check("failed migration preserves original audit column", run(db, "SELECT count(*) FROM information_schema.columns WHERE table_name='system_log' AND column_name='log_id'") === "1");
}
try {
  assert.match(prefix, /^vayro_auth_test_[a-f0-9]+$/);
  run("postgres", `CREATE DATABASE ${prefix}`); created.push(prefix);
  const split = init.indexOf("CREATE TABLE IF NOT EXISTS system_log");
  assert.ok(split > 0);
  const legacy = init.slice(0, split).replace("contact_name     VARCHAR(100)", "contact_name     VARCHAR(150)") + init.slice(split)
    .replace("system_log_id BIGINT", "log_id      BIGINT")
    .replace("BIGINT REFERENCES company (company_id)", "BIGINT")
    .replace("BIGINT REFERENCES users (user_id)", "BIGINT")
    .replace("action      VARCHAR(120)", "action      VARCHAR(60)")
    .replace("entity_type VARCHAR(80)", "entity_type VARCHAR(40)")
    .replace("entity_id   VARCHAR(80)", "entity_id   VARCHAR(120)");
  run(prefix, legacy);
  run(prefix, "INSERT INTO company(company_name,contact_name) VALUES ('fixture', repeat('x',101)); INSERT INTO users(company_id,full_name,email,password_hash,role) VALUES (1,'fixture','fixture@example.test','fixture-only','driver'); INSERT INTO system_log(company_id,user_id,action,entity_id) VALUES (1,1,'fixture',repeat('y',81))");
  rejected(prefix, "overlong contact blocks migration without truncation");
  check("contact remains 101 after rejection", run(prefix, "SELECT char_length(contact_name) FROM company") === "101");
  run(prefix, "UPDATE company SET contact_name=repeat('x',100)");
  rejected(prefix, "overlong entity_id blocks migration without truncation");
  run(prefix, "UPDATE system_log SET entity_id=repeat('y',80), user_id=999999");
  rejected(prefix, "orphan audit reference blocks migration");
  run(prefix, "UPDATE system_log SET user_id=1");
  run(prefix, migration);
  check("audit key renamed with original row retained", run(prefix, "SELECT system_log_id FROM system_log") === "1");
  check("contact value retained", run(prefix, "SELECT char_length(contact_name) FROM company") === "100");
  check("audit foreign keys installed", run(prefix, "SELECT count(*) FROM pg_constraint WHERE conrelid='public.system_log'::regclass AND contype='f'") === "2");
  check("audit lengths match dictionary", run(prefix, "SELECT string_agg(column_name||':'||character_maximum_length,',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='system_log' AND column_name IN ('action','entity_type','entity_id')") === "action:120,entity_id:80,entity_type:80");
  run(prefix, migration);
  check("migration can be repeated without losing data", run(prefix, "SELECT count(*) FROM system_log") === "1");
  const fresh = `${prefix}_fresh`;
  run("postgres", `CREATE DATABASE ${fresh}`); created.push(fresh);
  run(fresh, init + migration);
  check("fresh database initializes correctly", run(fresh, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'") === "4");
  console.log(`${checks} migration checks passed`);
} finally {
  for (const database of created.reverse()) {
    assert.match(database, /^vayro_auth_test_[a-f0-9]+(?:_fresh)?$/);
    run("postgres", `DROP DATABASE ${database}`);
  }
}
