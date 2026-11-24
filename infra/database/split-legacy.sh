#!/bin/sh
# Moves data from the old shared database (vayro) into the per-service databases, and checks that it arrived.
# Read-only on the old database: nothing is deleted from it, so it stays as a backup.
#
# Safe to run again, at any time. For every table it copies the source rows the target does not have yet (matched on the
# primary key; a row already in the target is never overwritten), then checks that EVERY source row is in the target.
# A table that was only partly copied is therefore completed, never skipped. If a source row cannot be copied (for example
# its e-mail already belongs to a different row in the target) the table is reported as MISSING and the script exits 1.
# Rows the services wrote after the move are left alone.
#
# Order (from the repo root):
#   1. docker compose exec -T postgres sh /docker-entrypoint-initdb.d/01-create-databases.sh
#   2. docker compose up -d --build --wait
#   3. docker compose exec -T postgres sh < infra/database/split-legacy.sh
set -eu
U="${POSTGRES_USER:-vayro}"
SRC="${LEGACY_DB:-vayro}"
failed=0
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# copy <db> <table> <id column> <columns> [source filter]
copy() {
  db=$1 table=$2 idcol=$3 cols=$4 where=${5:-TRUE}
  want=$(psql -U "$U" -d "$SRC" -tAc "SELECT count(*) FROM $table WHERE $where") || { echo "FAILED $db.$table: cannot read the old database"; failed=1; return; }
  # Read the source into a file first, so a failed read cannot look like "nothing to copy".
  if ! psql -v ON_ERROR_STOP=1 -U "$U" -d "$SRC" -c "\\copy (SELECT $cols FROM $table WHERE $where ORDER BY 1) TO STDOUT" > "$tmp"; then
    echo "FAILED $db.$table: cannot read the old database"; failed=1; return
  fi
  before=$(psql -U "$U" -d "$db" -tAc "SELECT count(*) FROM $table")
  # One transaction: load the source rows into a temporary table, insert the ones the target lacks, then count how many
  # source ids are present afterwards.
  if ! result=$({
    printf 'BEGIN;\nCREATE TEMP TABLE _src (LIKE %s INCLUDING DEFAULTS) ON COMMIT DROP;\nCOPY _src (%s) FROM STDIN;\n' "$table" "$cols"
    cat "$tmp"
    printf '\\.\nINSERT INTO %s (%s) SELECT %s FROM _src ON CONFLICT DO NOTHING;\n' "$table" "$cols" "$cols"
    printf "SELECT (SELECT count(*) FROM _src) || '|' || (SELECT count(*) FROM %s WHERE %s IN (SELECT %s FROM _src));\nCOMMIT;\n" "$table" "$idcol" "$idcol"
  } | psql -q -v ON_ERROR_STOP=1 -U "$U" -d "$db" -tA); then
    echo "FAILED $db.$table: could not write to the new database"; failed=1; return
  fi
  read_rows=${result%%|*}
  present=${result##*|}
  # BIGSERIAL sequences must continue after the copied ids (never move one backwards).
  psql -v ON_ERROR_STOP=1 -U "$U" -d "$db" -tAc "SELECT setval(pg_get_serial_sequence('$table', '$idcol'), m) FROM (SELECT max($idcol) AS m FROM $table) x WHERE m IS NOT NULL AND m > COALESCE((SELECT last_value FROM pg_sequences WHERE sequencename = split_part(pg_get_serial_sequence('$table', '$idcol'), '.', 2)), 0)" >/dev/null
  after=$(psql -U "$U" -d "$db" -tAc "SELECT count(*) FROM $table")
  if [ "$read_rows" = "$want" ] && [ "$present" = "$want" ]; then
    echo "ok      $db.$table: all $want source rows present ($((after - before)) copied now, $((present - (after - before))) were already there)"
  else
    echo "MISSING $db.$table: source has $want rows, $present are in the new database"; failed=1
  fi
}

LOG="system_log_id, company_id, user_id, action, entity_type, entity_id, old_value, new_value, result, ip_address, created_at"
# Old audit rows go to the service that wrote them (by action prefix); anything unrecognised goes to integration_db.
KNOWN="action LIKE 'auth.%' OR action LIKE 'company.%' OR action LIKE 'user.%' OR action LIKE 'gps_device.%'"

# 1 Authentication, 2 Company, 3 User
copy auth_db auth_sessions session_id "session_id, user_id, refresh_token_hash, expires_at, revoked_at, last_used_at, ip_address, user_agent, created_at"
copy auth_db system_log system_log_id "$LOG" "action LIKE 'auth.%'"
copy company_db company company_id "company_id, company_name, workspace_status, contact_name, contact_email, contact_phone, created_at, updated_at"
copy company_db system_log system_log_id "$LOG" "action LIKE 'company.%'"
copy user_db users user_id "user_id, company_id, full_name, email, password_hash, role, phone, account_status, created_at, updated_at"
copy user_db system_log system_log_id "$LOG" "action LIKE 'user.%'"

# 4 Vehicle, 9 Transport Job
copy vehicle_db vehicle_types vehicle_type_id "vehicle_type_id, company_id, type_name, description, is_active, created_at, updated_at"
copy vehicle_db vehicles vehicle_id "vehicle_id, company_id, vehicle_type_id, vehicle_code, license_plate, vehicle_status, current_driver_id, created_at, updated_at"
copy transport_db transport_jobs job_id "job_id, company_id, job_code, job_name, pickup_address, pickup_latitude, pickup_longitude, delivery_address, delivery_latitude, delivery_longitude, vehicle_id, driver_id, scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at, job_status, problem_note, created_by, created_at, updated_at"

# 5 GPS Device, 6 GPS Data
copy gps_device_db gps_devices gps_device_id "gps_device_id, company_id, vehicle_id, device_code, source_type, provider_name, connection_config, credentials_encrypted, connection_status, last_received_at, created_at, updated_at"
copy gps_device_db system_log system_log_id "$LOG" "action LIKE 'gps_device.%'"
copy gps_data_db gps_locations gps_location_id "gps_location_id, company_id, vehicle_id, gps_device_id, external_record_id, latitude, longitude, speed_kmh, direction_degree, accuracy_meters, recorded_at, received_at"

# 10 Alert & Geofence (geofences first: alerts point at them)
copy alert_db geofences geofence_id "geofence_id, company_id, geofence_name, center_latitude, center_longitude, radius_meters, notify_enter, notify_exit, geofence_status, created_by, created_at, updated_at"
copy alert_db alert_rules alert_rule_id "alert_rule_id, company_id, rule_type, threshold_value, is_enabled, created_by, created_at, updated_at"
copy alert_db alerts alert_id "alert_id, company_id, vehicle_id, job_id, geofence_id, recipient_user_id, alert_type, title, detail, event_data, triggered_at, alert_status, handled_by, resolved_at"

# 12 Integration & Logging (api_integrations first: request logs point at them)
copy integration_db api_integrations integration_id "integration_id, company_id, integration_name, api_key_prefix, api_key_hash, permissions, rate_limit_per_minute, integration_status, created_by, created_at, last_used_at, revoked_at"
copy integration_db api_request_logs api_log_id "api_log_id, integration_id, company_id, http_method, endpoint, http_status, request_at, duration_ms, request_id, source_ip"
copy integration_db system_log system_log_id "$LOG" "NOT ($KNOWN)"

exit $failed
