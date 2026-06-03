-- Protected Environment lifecycle metadata (PDF-04 / INS-50).

ALTER TABLE environments
  ADD COLUMN lifecycle_stage text,
  ADD COLUMN preview_non_production_confirmed_at timestamptz,
  ADD COLUMN preview_non_production_confirmed_by_user_id text;

UPDATE environments
SET lifecycle_stage = CASE
  WHEN is_protected THEN 'production'
  ELSE 'development'
END
WHERE lifecycle_stage IS NULL;

ALTER TABLE environments
  ALTER COLUMN lifecycle_stage SET NOT NULL;

ALTER TABLE environments
  ADD CONSTRAINT environments_lifecycle_stage_check
  CHECK (
    lifecycle_stage IN ('development', 'preview', 'staging', 'production')
  );

ALTER TABLE environments
  ADD CONSTRAINT environments_development_non_protected_check
  CHECK (lifecycle_stage <> 'development' OR is_protected = false);

ALTER TABLE environments
  ADD CONSTRAINT environments_staging_production_protected_check
  CHECK (lifecycle_stage NOT IN ('staging', 'production') OR is_protected = true);

ALTER TABLE environments
  ADD CONSTRAINT environments_preview_opt_down_evidence_check
  CHECK (
    lifecycle_stage <> 'preview'
    OR is_protected = true
    OR (
      preview_non_production_confirmed_at IS NOT NULL
      AND preview_non_production_confirmed_by_user_id IS NOT NULL
    )
  );

ALTER TABLE environments
  ADD CONSTRAINT environments_preview_opt_down_fields_scope_check
  CHECK (
    (
      preview_non_production_confirmed_at IS NULL
      AND preview_non_production_confirmed_by_user_id IS NULL
    )
    OR lifecycle_stage = 'preview'
  );
