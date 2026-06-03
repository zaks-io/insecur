-- App connection credentials and Sensitive Metadata field storage (PDF-06 / INS-52).
-- Plaintext lookup remains limited to opaque resource IDs and Display Names on parent rows.

CREATE TABLE app_connections (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  provider text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE provider_credentials (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  app_connection_id text NOT NULL,
  provider text NOT NULL,
  organization_data_key_version integer NOT NULL,
  ciphertext_storage_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, app_connection_id) REFERENCES app_connections (org_id, id)
);

CREATE TABLE sensitive_metadata_fields (
  org_id text NOT NULL REFERENCES organizations (id),
  scope_project_id text,
  metadata_type text NOT NULL,
  record_resource_id text NOT NULL,
  field_key text NOT NULL,
  organization_data_key_version integer NOT NULL,
  project_data_key_version integer,
  ciphertext_storage_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, metadata_type, record_resource_id, field_key),
  CONSTRAINT sensitive_metadata_fields_scope_project_fkey
    FOREIGN KEY (org_id, scope_project_id) REFERENCES projects (org_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE app_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE sensitive_metadata_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive_metadata_fields FORCE ROW LEVEL SECURITY;

CREATE POLICY app_connections_tenant_isolation ON app_connections
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY provider_credentials_tenant_isolation ON provider_credentials
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY sensitive_metadata_fields_tenant_isolation ON sensitive_metadata_fields
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
