-- Tenant-first baseline schema with Row-Level Security (FV-04 / ADR-0037).
-- Policies ship with tables; runtime role is NOBYPASSRLS with FORCE ROW LEVEL SECURITY.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.tenant_visible(check_org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('app.service', true) = 'true' THEN true
    WHEN NULLIF(current_setting('app.current_org', true), '') IS NOT NULL
      THEN check_org_id = current_setting('app.current_org', true)
    ELSE false
  END;
$$;

CREATE TABLE instances (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id text PRIMARY KEY,
  instance_id text NOT NULL REFERENCES instances (id),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE environments (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  project_id text NOT NULL,
  display_name text NOT NULL,
  is_protected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id)
);

CREATE TABLE teams (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  display_name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE memberships (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  team_id text,
  user_id text NOT NULL,
  role_preset text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, team_id) REFERENCES teams (org_id, id)
);

CREATE TABLE organization_data_keys (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  key_version integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key_version)
);

CREATE TABLE project_data_keys (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  project_id text NOT NULL,
  key_version integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key_version),
  FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id)
);

CREATE TABLE secrets (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  project_id text NOT NULL,
  environment_id text NOT NULL,
  variable_key text NOT NULL,
  current_version_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id, variable_key),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id),
  FOREIGN KEY (org_id, environment_id) REFERENCES environments (org_id, id)
);

CREATE TABLE secret_versions (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  secret_id text NOT NULL,
  version_number integer NOT NULL,
  organization_data_key_version integer,
  project_data_key_version integer,
  ciphertext_storage_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (secret_id, version_number),
  UNIQUE (org_id, secret_id, id),
  FOREIGN KEY (org_id, secret_id) REFERENCES secrets (org_id, id)
);

ALTER TABLE secrets
  ADD CONSTRAINT secrets_org_id_id_current_version_id_fkey
  FOREIGN KEY (org_id, id, current_version_id)
  REFERENCES secret_versions (org_id, secret_id, id);

CREATE TABLE injection_grants (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  project_id text NOT NULL,
  environment_id text NOT NULL,
  variable_keys text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id),
  FOREIGN KEY (org_id, environment_id) REFERENCES environments (org_id, id)
);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  event_code text NOT NULL,
  outcome text NOT NULL,
  actor_type text NOT NULL,
  actor_user_id text,
  project_id text,
  environment_id text,
  resource_type text,
  resource_id text,
  request_id text,
  operation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operations (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  state text NOT NULL,
  intent_code text NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX operations_org_idempotency_key_idx
  ON operations (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE environments FORCE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_data_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_data_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE project_data_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_data_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE secrets FORCE ROW LEVEL SECURITY;
ALTER TABLE secret_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE injection_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE injection_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_tenant_isolation ON organizations
  FOR ALL
  USING (app.tenant_visible(id))
  WITH CHECK (app.tenant_visible(id));

CREATE POLICY projects_tenant_isolation ON projects
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY environments_tenant_isolation ON environments
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY teams_tenant_isolation ON teams
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY memberships_tenant_isolation ON memberships
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY organization_data_keys_tenant_isolation ON organization_data_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY project_data_keys_tenant_isolation ON project_data_keys
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY secrets_tenant_isolation ON secrets
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY secret_versions_tenant_isolation ON secret_versions
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY injection_grants_tenant_isolation ON injection_grants
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY audit_events_tenant_isolation ON audit_events
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY operations_tenant_isolation ON operations
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

GRANT USAGE ON SCHEMA app TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.tenant_visible(text) TO PUBLIC;
