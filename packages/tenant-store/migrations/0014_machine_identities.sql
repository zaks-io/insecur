-- Organization-owned Machine Identities and project-scoped memberships (MAC-01 / ADR-0004).

CREATE TABLE machine_identities (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE machine_identity_memberships (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  machine_identity_id text NOT NULL,
  project_id text NOT NULL,
  authorization_scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, machine_identity_id, project_id),
  FOREIGN KEY (org_id, machine_identity_id) REFERENCES machine_identities (org_id, id),
  FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id),
  CONSTRAINT machine_identity_memberships_project_scoped CHECK (project_id IS NOT NULL),
  CONSTRAINT machine_identity_memberships_scopes_nonempty CHECK (
    cardinality(authorization_scopes) > 0
  )
);

ALTER TABLE machine_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE machine_identity_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_identity_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY machine_identities_tenant_isolation ON machine_identities
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

CREATE POLICY machine_identity_memberships_tenant_isolation ON machine_identity_memberships
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
