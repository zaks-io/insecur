-- Organization and project data key metadata for PDF-05 / INS-51.
-- Adds lifecycle states, wrapped-key storage references, and root custody evidence refs.

ALTER TABLE organization_data_keys
  ADD COLUMN root_key_version integer NOT NULL DEFAULT 1,
  ADD COLUMN wrapped_storage_ref text,
  ADD COLUMN custody_evidence_ref text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE organization_data_keys
  ADD CONSTRAINT organization_data_keys_status_check
  CHECK (status IN ('active', 'retired', 'revoked'));

CREATE UNIQUE INDEX organization_data_keys_one_active_per_org
  ON organization_data_keys (org_id)
  WHERE status = 'active';

ALTER TABLE project_data_keys
  ADD COLUMN organization_data_key_version integer NOT NULL DEFAULT 1,
  ADD COLUMN wrapped_storage_ref text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE project_data_keys
  ADD CONSTRAINT project_data_keys_status_check
  CHECK (status IN ('active', 'retired', 'revoked'));

ALTER TABLE project_data_keys
  ADD CONSTRAINT project_data_keys_org_key_version_fkey
  FOREIGN KEY (org_id, organization_data_key_version)
  REFERENCES organization_data_keys (org_id, key_version);

CREATE UNIQUE INDEX project_data_keys_one_active_per_project
  ON project_data_keys (org_id, project_id)
  WHERE status = 'active';
