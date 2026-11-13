-- Remaining ten tables from the PDF Data Dictionary, pages 8-16.
BEGIN;

-- Composite candidate keys enforce the dictionary's same-company relationships.
CREATE UNIQUE INDEX IF NOT EXISTS users_company_user_key ON users(company_id, user_id);

CREATE TABLE IF NOT EXISTS vehicle_types (
  vehicle_type_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  type_name VARCHAR(80) NOT NULL,
  description VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, type_name), UNIQUE(company_id, vehicle_type_id)
);

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  vehicle_type_id BIGINT,
  vehicle_code VARCHAR(50) NOT NULL,
  license_plate VARCHAR(30) NOT NULL,
  vehicle_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(vehicle_status IN ('active','inactive','maintenance')),
  current_driver_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, vehicle_code), UNIQUE(company_id, vehicle_id),
  FOREIGN KEY(company_id, vehicle_type_id) REFERENCES vehicle_types(company_id, vehicle_type_id),
  FOREIGN KEY(company_id, current_driver_id) REFERENCES users(company_id, user_id)
);

CREATE TABLE IF NOT EXISTS gps_devices (
  gps_device_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  vehicle_id BIGINT NOT NULL,
  device_code VARCHAR(100) NOT NULL,
  source_type VARCHAR(30) NOT NULL CHECK(source_type IN ('gps_device','provider_api','driver_mobile_app')),
  provider_name VARCHAR(120),
  connection_config JSONB,
  credentials_encrypted TEXT,
  connection_status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK(connection_status IN ('connected','disconnected','error')),
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, device_code), UNIQUE(company_id, gps_device_id),
  FOREIGN KEY(company_id, vehicle_id) REFERENCES vehicles(company_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS gps_locations (
  gps_location_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  vehicle_id BIGINT NOT NULL,
  gps_device_id BIGINT,
  external_record_id VARCHAR(100),
  latitude NUMERIC(10,7) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10,7) NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  speed_kmh NUMERIC(7,2) CHECK(speed_kmh >= 0),
  direction_degree SMALLINT CHECK(direction_degree BETWEEN 0 AND 359),
  accuracy_meters NUMERIC(8,2) CHECK(accuracy_meters >= 0),
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id, vehicle_id) REFERENCES vehicles(company_id, vehicle_id),
  FOREIGN KEY(company_id, gps_device_id) REFERENCES gps_devices(company_id, gps_device_id),
  UNIQUE(gps_device_id, external_record_id)
);
CREATE INDEX IF NOT EXISTS gps_locations_vehicle_time_idx ON gps_locations(company_id, vehicle_id, recorded_at);
CREATE INDEX IF NOT EXISTS gps_locations_device_received_idx ON gps_locations(gps_device_id, received_at);

CREATE TABLE IF NOT EXISTS transport_jobs (
  job_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  job_code VARCHAR(50) NOT NULL,
  job_name VARCHAR(150),
  pickup_address VARCHAR(255) NOT NULL,
  pickup_latitude NUMERIC(10,7) CHECK(pickup_latitude BETWEEN -90 AND 90),
  pickup_longitude NUMERIC(10,7) CHECK(pickup_longitude BETWEEN -180 AND 180),
  delivery_address VARCHAR(255) NOT NULL,
  delivery_latitude NUMERIC(10,7) CHECK(delivery_latitude BETWEEN -90 AND 90),
  delivery_longitude NUMERIC(10,7) CHECK(delivery_longitude BETWEEN -180 AND 180),
  vehicle_id BIGINT,
  driver_id BIGINT,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  job_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(job_status IN ('pending','assigned','in_progress','completed','cancelled','problem')),
  problem_note TEXT,
  created_by BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, job_code), UNIQUE(company_id, job_id),
  FOREIGN KEY(company_id, vehicle_id) REFERENCES vehicles(company_id, vehicle_id),
  FOREIGN KEY(company_id, driver_id) REFERENCES users(company_id, user_id)
);

CREATE TABLE IF NOT EXISTS geofences (
  geofence_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  geofence_name VARCHAR(120) NOT NULL,
  center_latitude NUMERIC(10,7) NOT NULL CHECK(center_latitude BETWEEN -90 AND 90),
  center_longitude NUMERIC(10,7) NOT NULL CHECK(center_longitude BETWEEN -180 AND 180),
  radius_meters BIGINT NOT NULL CHECK(radius_meters BETWEEN 0 AND 4294967295),
  notify_enter BOOLEAN NOT NULL DEFAULT TRUE,
  notify_exit BOOLEAN NOT NULL DEFAULT TRUE,
  geofence_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(geofence_status IN ('active','inactive')),
  created_by BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, geofence_id)
);
CREATE INDEX IF NOT EXISTS geofences_company_status_idx ON geofences(company_id, geofence_status);

CREATE TABLE IF NOT EXISTS alert_rules (
  alert_rule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  rule_type VARCHAR(20) NOT NULL CHECK(rule_type IN ('gps_offline','overspeed')),
  threshold_value NUMERIC(10,2),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, rule_type)
);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  vehicle_id BIGINT,
  job_id BIGINT,
  geofence_id BIGINT,
  recipient_user_id BIGINT,
  alert_type VARCHAR(30) NOT NULL CHECK(alert_type IN ('gps_offline','overspeed','geofence_enter','geofence_exit','system_anomaly','job_assignment')),
  title VARCHAR(150) NOT NULL,
  detail TEXT,
  event_data JSONB,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_status VARCHAR(20) NOT NULL DEFAULT 'unread' CHECK(alert_status IN ('unread','read','handling','resolved')),
  handled_by BIGINT REFERENCES users(user_id),
  resolved_at TIMESTAMPTZ,
  FOREIGN KEY(company_id, vehicle_id) REFERENCES vehicles(company_id, vehicle_id),
  FOREIGN KEY(company_id, job_id) REFERENCES transport_jobs(company_id, job_id),
  FOREIGN KEY(company_id, geofence_id) REFERENCES geofences(company_id, geofence_id),
  FOREIGN KEY(company_id, recipient_user_id) REFERENCES users(company_id, user_id)
);
CREATE INDEX IF NOT EXISTS alerts_company_status_time_idx ON alerts(company_id, alert_status, triggered_at);

CREATE TABLE IF NOT EXISTS api_integrations (
  integration_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  integration_name VARCHAR(120) NOT NULL,
  api_key_prefix VARCHAR(20) NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  permissions JSONB NOT NULL,
  rate_limit_per_minute BIGINT CHECK(rate_limit_per_minute BETWEEN 0 AND 4294967295),
  integration_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK(integration_status IN ('active','revoked','disabled')),
  created_by BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE(company_id, integration_id)
);

CREATE TABLE IF NOT EXISTS api_request_logs (
  api_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  integration_id BIGINT,
  company_id BIGINT NOT NULL REFERENCES company(company_id),
  http_method VARCHAR(10) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  http_status INTEGER CHECK(http_status BETWEEN 0 AND 65535),
  request_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms BIGINT CHECK(duration_ms BETWEEN 0 AND 4294967295),
  request_id VARCHAR(100),
  source_ip VARCHAR(45),
  FOREIGN KEY(company_id, integration_id) REFERENCES api_integrations(company_id, integration_id)
);
CREATE INDEX IF NOT EXISTS api_request_logs_company_time_idx ON api_request_logs(company_id, request_at);

CREATE OR REPLACE FUNCTION public.maintain_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DO $$
DECLARE tab TEXT;
BEGIN
  FOREACH tab IN ARRAY ARRAY['company','users','vehicle_types','vehicles','gps_devices','transport_jobs','geofences','alert_rules'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',tab)::regclass AND tgname='maintain_updated_at') THEN
      EXECUTE format('CREATE TRIGGER maintain_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.maintain_updated_at()',tab);
    END IF;
  END LOOP;
END $$;
COMMIT;
