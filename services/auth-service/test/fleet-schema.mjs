// Operator-only local test. Creates and drops only its uniquely named fixture database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dict = JSON.parse(readFileSync(new URL("../../../docs/data-dictionary.json", import.meta.url), "utf8"));
const migrations = ["001_auth.sql", "002_align_auth_dictionary.sql", "003_fleet_dictionary.sql"].map(name => readFileSync(new URL(`../../../infra/database/${name}`, import.meta.url), "utf8"));
const db = `vayro_fleet_test_${randomUUID().replaceAll("-", "")}`;
assert.match(db, /^vayro_fleet_test_[a-f0-9]+$/);
let created = false, checks = 0;
function run(query, target = db) {
  return execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "vayro", "-d", target, "-tA"],
    { cwd: root, input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function check(name, value) { assert.ok(value, name); console.log("PASS", name); checks++; }
function rejects(name, query, expected) {
  let message = "";
  try { run(query); } catch (error) { message = error.stderr; }
  check(name, !!message && message.includes(expected));
}
try {
  run(`CREATE DATABASE ${db}`, "postgres"); created = true;
  run(migrations[0] + migrations[1]);
  run("INSERT INTO company(company_name) VALUES ('Preserved A'),('Company B'); INSERT INTO users(company_id,full_name,email,password_hash,role) VALUES (1,'Driver A','a@example.test','fixture-only','driver'),(2,'Driver B','b@example.test','fixture-only','driver'); INSERT INTO auth_sessions(user_id,refresh_token_hash,expires_at) VALUES (1,'fixture-hash',now()+interval '1 day')");
  run(migrations[2]);
  check("upgrade preserves existing accounts and sessions", run("SELECT (SELECT count(*) FROM users)||':'||(SELECT count(*) FROM auth_sessions)") === "2:1");
  check("exactly the fourteen dictionary tables exist", run("SELECT string_agg(table_name,',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public'") === Object.keys(dict.tables).sort().join(","));
  for (const [table, fields] of Object.entries(dict.tables)) {
    assert.match(table, /^[a-z_]+$/);
    const actual = JSON.parse(run(`SELECT json_agg(json_build_array(attname,replace(replace(format_type(atttypid,atttypmod),'character varying','varchar'),'timestamp with time zone','timestamptz'),NOT attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attnum>0 AND NOT attisdropped`));
    assert.deepEqual(actual, fields, `${table} fields/type/nullability differ from the dictionary manifest`);
    check(`${table}: all fields, types and nullability match`, true);
    check(`${table}: identity primary key`, run(`SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='${table}' AND c.column_name='${fields[0][0]}' AND c.is_identity='YES' AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='p')`) === "1");
  }
  for (const [key, value] of Object.entries(dict.defaults)) {
    const [table, column] = key.split(".");
    const actual = run(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'`);
    check(`${key}: dictionary default`, actual.includes(typeof value === "boolean" ? String(value) : `'${value}'`));
  }
  for (const [key, values] of Object.entries(dict.enums)) {
    const [table, column] = key.split(".");
    const definitions = run(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='c'`).split("\n");
    check(`${key}: exact allowed values`, definitions.some(def => def.includes(column) && JSON.stringify([...new Set([...def.matchAll(/'([^']+)'/g)].map(m => m[1]))].sort()) === JSON.stringify([...values].sort())));
  }
  run("INSERT INTO vehicle_types(company_id,type_name) VALUES (1,'Truck'),(2,'Truck'); INSERT INTO vehicles(company_id,vehicle_type_id,vehicle_code,license_plate,current_driver_id) VALUES (1,1,'V1','A-1',1),(2,2,'V2','B-2',2); INSERT INTO gps_devices(company_id,vehicle_id,device_code,source_type) VALUES (1,1,'D1','gps_device')");
  rejects("vehicle type cannot cross companies", "INSERT INTO vehicles(company_id,vehicle_type_id,vehicle_code,license_plate) VALUES (1,2,'wrong','wrong')", "foreign key");
  rejects("driver cannot cross companies", "UPDATE vehicles SET current_driver_id=2 WHERE vehicle_id=1", "foreign key");
  rejects("device cannot cross companies", "INSERT INTO gps_devices(company_id,vehicle_id,device_code,source_type) VALUES (1,2,'wrong','gps_device')", "foreign key");
  rejects("duplicate device code blocked per company", "INSERT INTO gps_devices(company_id,vehicle_id,device_code,source_type) VALUES (1,1,'D1','gps_device')", "unique constraint");
  run("INSERT INTO gps_devices(company_id,vehicle_id,device_code,source_type) VALUES (2,2,'D1','gps_device')");
  check("same device code allowed in different companies", run("SELECT count(*) FROM gps_devices WHERE device_code='D1'") === "2");
  run("INSERT INTO gps_locations(company_id,vehicle_id,gps_device_id,external_record_id,latitude,longitude,recorded_at) VALUES (1,1,1,'record-1',13.75,100.5,now())");
  rejects("duplicate GPS record blocked", "INSERT INTO gps_locations(company_id,vehicle_id,gps_device_id,external_record_id,latitude,longitude,recorded_at) VALUES (1,1,1,'record-1',13.75,100.5,now())", "unique constraint");
  rejects("position cannot use another company's device", "INSERT INTO gps_locations(company_id,vehicle_id,gps_device_id,latitude,longitude,recorded_at) VALUES (2,2,1,13.75,100.5,now())", "foreign key");
  rejects("device with history cannot be deleted", "DELETE FROM gps_devices WHERE gps_device_id=1", "foreign key");
  rejects("bad GPS coordinates blocked in PostgreSQL", "INSERT INTO gps_locations(company_id,vehicle_id,latitude,longitude,recorded_at) VALUES (1,1,91,100,now())", "check constraint");
  rejects("direction 360 blocked", "UPDATE gps_locations SET direction_degree=360", "check constraint");
  run("INSERT INTO transport_jobs(company_id,job_code,pickup_address,delivery_address,vehicle_id,driver_id,created_by) VALUES (1,'J1','pickup','delivery',1,1,1); INSERT INTO geofences(company_id,geofence_name,center_latitude,center_longitude,radius_meters,created_by) VALUES (1,'G1',13.75,100.5,100,1); INSERT INTO alert_rules(company_id,rule_type,threshold_value,created_by) VALUES (1,'gps_offline',5,1); INSERT INTO alerts(company_id,vehicle_id,job_id,geofence_id,recipient_user_id,alert_type,title) VALUES (1,1,1,1,1,'job_assignment','Test assignment'); INSERT INTO api_integrations(company_id,integration_name,api_key_prefix,api_key_hash,permissions,created_by) VALUES (1,'Test','prefix','fixture-hash','{}',1); INSERT INTO api_request_logs(company_id,integration_id,http_method,endpoint) VALUES (1,1,'GET','/fixture')");
  rejects("transport job cannot use another company driver", "UPDATE transport_jobs SET driver_id=2", "foreign key");
  rejects("alert cannot cross recipient company", "UPDATE alerts SET recipient_user_id=2", "foreign key");
  rejects("API log cannot cross integration company", "INSERT INTO api_request_logs(company_id,integration_id,http_method,endpoint) VALUES (2,1,'GET','/fixture')", "foreign key");
  rejects("unsigned radius cannot be negative", "UPDATE geofences SET radius_meters=-1", "check constraint");
  run("UPDATE vehicles SET updated_at='2000-01-01' WHERE vehicle_id=1");
  check("updated_at is maintained automatically", run("SELECT updated_at>'2000-01-02' FROM vehicles WHERE vehicle_id=1") === "t");
  run(migrations[2]);
  check("repeat migration preserves GPS data", run("SELECT count(*) FROM gps_locations") === "1");
  check("all ten new tables are usable", run("SELECT (SELECT count(*) FROM vehicle_types)>0 AND (SELECT count(*) FROM vehicles)>0 AND (SELECT count(*) FROM gps_devices)>0 AND (SELECT count(*) FROM gps_locations)>0 AND (SELECT count(*) FROM transport_jobs)>0 AND (SELECT count(*) FROM geofences)>0 AND (SELECT count(*) FROM alert_rules)>0 AND (SELECT count(*) FROM alerts)>0 AND (SELECT count(*) FROM api_integrations)>0 AND (SELECT count(*) FROM api_request_logs)>0") === "t");
  console.log(`${checks} fleet-schema checks passed`);
} finally { if (created) run(`DROP DATABASE ${db}`, "postgres"); }
