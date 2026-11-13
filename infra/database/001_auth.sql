-- Auth, company workspace, and audit tables (Data Dictionary: company, users, auth_sessions, system_log).
-- Runs once, when the Postgres data volume is first created (docker-entrypoint-initdb.d).

CREATE TABLE IF NOT EXISTS company (
  company_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_name     VARCHAR(150) NOT NULL,
  workspace_status VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (workspace_status IN ('pending', 'active', 'suspended', 'rejected')),
  contact_name     VARCHAR(150),
  contact_email    VARCHAR(150) UNIQUE,
  contact_phone    VARCHAR(30),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  user_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id     BIGINT REFERENCES company (company_id),
  full_name      VARCHAR(150) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(20)  NOT NULL
                 CHECK (role IN ('platform_admin', 'company_admin', 'dispatcher', 'driver')),
  phone          VARCHAR(30),
  account_status VARCHAR(20)  NOT NULL DEFAULT 'active'
                 CHECK (account_status IN ('active', 'inactive', 'suspended')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- platform_admin has no company; every other role must belong to one
  CHECK ((role = 'platform_admin') = (company_id IS NULL))
);
CREATE INDEX IF NOT EXISTS users_company_idx ON users (company_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            BIGINT       NOT NULL REFERENCES users (user_id),
  refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at         TIMESTAMPTZ  NOT NULL,
  revoked_at         TIMESTAMPTZ,
  last_used_at       TIMESTAMPTZ,
  ip_address         VARCHAR(45),
  user_agent         VARCHAR(255),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id, expires_at);

-- Audit trail. Never store passwords, tokens or secrets in old_value/new_value.
CREATE TABLE IF NOT EXISTS system_log (
  log_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT,
  user_id     BIGINT,
  action      VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40),
  entity_id   VARCHAR(120),
  old_value   JSONB,
  new_value   JSONB,
  result      VARCHAR(10) NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS system_log_company_idx ON system_log (company_id, created_at);
