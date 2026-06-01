-- Project-scoped memberships for org-tier vs project-tier Effective Access (FV-06).

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS project_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_org_id_project_id_fkey'
  ) THEN
    ALTER TABLE memberships
      ADD CONSTRAINT memberships_org_id_project_id_fkey
      FOREIGN KEY (org_id, project_id) REFERENCES projects (org_id, id);
  END IF;
END
$$;
