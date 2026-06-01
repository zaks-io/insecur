-- Org-and-secret-qualified current_version pointer. Skipped when 0001 already applied it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'secret_versions_org_id_secret_id_id_key'
  ) THEN
    ALTER TABLE secret_versions
      ADD CONSTRAINT secret_versions_org_id_secret_id_id_key
      UNIQUE (org_id, secret_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'secrets_org_id_id_current_version_id_fkey'
  ) THEN
    ALTER TABLE secrets
      ADD CONSTRAINT secrets_org_id_id_current_version_id_fkey
      FOREIGN KEY (org_id, id, current_version_id)
      REFERENCES secret_versions (org_id, secret_id, id);
  END IF;
END
$$;
