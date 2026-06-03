-- Sync Target Serialization lease rows (ADR-0057, PS-02).
CREATE TABLE sync_target_leases (
  org_id text NOT NULL,
  project_id text NOT NULL,
  provider_kind text NOT NULL,
  target_identity text NOT NULL,
  held_by_operation_id text NOT NULL REFERENCES operations (id),
  fencing_token bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, project_id, provider_kind, target_identity),
  CONSTRAINT sync_target_leases_org_id_project_id_fkey
    FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id),
  CONSTRAINT sync_target_leases_fencing_token_positive CHECK (fencing_token > 0)
);

CREATE INDEX sync_target_leases_held_by_operation_id_idx
  ON sync_target_leases (org_id, held_by_operation_id);

ALTER TABLE sync_target_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_target_leases FORCE ROW LEVEL SECURITY;

CREATE POLICY sync_target_leases_tenant_isolation ON sync_target_leases
  FOR ALL
  USING (app.tenant_visible(org_id))
  WITH CHECK (app.tenant_visible(org_id));
