-- Org-qualified composite foreign keys for child rows that carry org_id plus a
-- tenant-owned parent id. Skipped when 0001 already created these constraints.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_org_id_team_id_fkey'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE projects ADD CONSTRAINT projects_org_id_id_key UNIQUE (org_id, id);
  ALTER TABLE teams ADD CONSTRAINT teams_org_id_id_key UNIQUE (org_id, id);
  ALTER TABLE environments ADD CONSTRAINT environments_org_id_id_key UNIQUE (org_id, id);

  ALTER TABLE environments DROP CONSTRAINT IF EXISTS environments_project_id_fkey;
  ALTER TABLE environments
    ADD CONSTRAINT environments_org_id_project_id_fkey
    FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id);

  ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_team_id_fkey;
  ALTER TABLE memberships
    ADD CONSTRAINT memberships_org_id_team_id_fkey
    FOREIGN KEY (org_id, team_id) REFERENCES teams (org_id, id);

  ALTER TABLE project_data_keys DROP CONSTRAINT IF EXISTS project_data_keys_project_id_fkey;
  ALTER TABLE project_data_keys
    ADD CONSTRAINT project_data_keys_org_id_project_id_fkey
    FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id);

  ALTER TABLE secrets DROP CONSTRAINT IF EXISTS secrets_project_id_fkey;
  ALTER TABLE secrets DROP CONSTRAINT IF EXISTS secrets_environment_id_fkey;
  ALTER TABLE secrets ADD CONSTRAINT secrets_org_id_id_key UNIQUE (org_id, id);
  ALTER TABLE secrets
    ADD CONSTRAINT secrets_org_id_project_id_fkey
    FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id);
  ALTER TABLE secrets
    ADD CONSTRAINT secrets_org_id_environment_id_fkey
    FOREIGN KEY (org_id, environment_id) REFERENCES environments (org_id, id);

  ALTER TABLE secret_versions DROP CONSTRAINT IF EXISTS secret_versions_secret_id_fkey;
  ALTER TABLE secret_versions
    ADD CONSTRAINT secret_versions_org_id_secret_id_fkey
    FOREIGN KEY (org_id, secret_id) REFERENCES secrets (org_id, id);

  ALTER TABLE injection_grants DROP CONSTRAINT IF EXISTS injection_grants_project_id_fkey;
  ALTER TABLE injection_grants DROP CONSTRAINT IF EXISTS injection_grants_environment_id_fkey;
  ALTER TABLE injection_grants
    ADD CONSTRAINT injection_grants_org_id_project_id_fkey
    FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id);
  ALTER TABLE injection_grants
    ADD CONSTRAINT injection_grants_org_id_environment_id_fkey
    FOREIGN KEY (org_id, environment_id) REFERENCES environments (org_id, id);
END
$$;
