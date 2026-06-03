-- GitHub Actions OIDC auth methods for Machine Identities (MAC-02 / ADR-0004).

CREATE TABLE machine_identity_github_actions_oidc (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations (id),
  machine_identity_id text NOT NULL,
  project_id text NOT NULL,
  environment_id text,
  github_repository text NOT NULL,
  github_environment text,
  oidc_audience text NOT NULL,
  credential_scopes text[] NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, machine_identity_id) REFERENCES machine_identities (org_id, id),
  FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id),
  FOREIGN KEY (org_id, environment_id) REFERENCES environments (org_id, id),
  CONSTRAINT machine_identity_github_actions_oidc_repository_lowercase CHECK (
    github_repository = lower(github_repository)
  ),
  CONSTRAINT machine_identity_github_actions_oidc_scopes_nonempty CHECK (
    cardinality(credential_scopes) > 0
  ),
  CONSTRAINT machine_identity_github_actions_oidc_status CHECK (status IN ('active', 'disabled'))
);

ALTER TABLE machine_identity_github_actions_oidc ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_identity_github_actions_oidc FORCE ROW LEVEL SECURITY;

CREATE POLICY machine_identity_github_actions_oidc_tenant_isolation
  ON machine_identity_github_actions_oidc
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));

-- Machine actors on audit events (MAC-02).
ALTER TABLE audit_events
  ADD COLUMN actor_machine_identity_id text;
