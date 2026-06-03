-- Protected Environment lifecycle metadata (PDF-04).

ALTER TABLE environments
  ADD COLUMN posture_tier text NOT NULL DEFAULT 'development',
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'active',
  ADD COLUMN preview_non_protected_opt_down_at timestamptz,
  ADD COLUMN preview_non_protected_opt_down_actor_user_id text,
  ADD COLUMN preview_automation_opt_in_at timestamptz,
  ADD COLUMN preview_automation_opt_in_actor_user_id text,
  ADD COLUMN lifecycle_updated_at timestamptz NOT NULL DEFAULT now();

UPDATE environments
SET posture_tier = CASE WHEN is_protected THEN 'staging' ELSE 'development' END;

ALTER TABLE environments
  ADD CONSTRAINT environments_posture_tier_check
  CHECK (posture_tier IN ('development', 'preview', 'staging', 'production'));

ALTER TABLE environments
  ADD CONSTRAINT environments_lifecycle_state_check
  CHECK (lifecycle_state IN ('active', 'archived'));

ALTER TABLE environments
  ADD CONSTRAINT environments_protected_posture_consistency CHECK (
    (posture_tier = 'development' AND is_protected = false)
    OR (posture_tier IN ('staging', 'production') AND is_protected = true)
    OR (
      posture_tier = 'preview'
      AND (
        (is_protected = true AND preview_non_protected_opt_down_at IS NULL)
        OR (
          is_protected = false
          AND preview_non_protected_opt_down_at IS NOT NULL
          AND preview_non_protected_opt_down_actor_user_id IS NOT NULL
        )
      )
    )
  );

ALTER TABLE environments
  ADD CONSTRAINT environments_preview_automation_opt_in_consistency CHECK (
    preview_automation_opt_in_at IS NULL
    OR (
      posture_tier = 'preview'
      AND is_protected = false
      AND preview_automation_opt_in_actor_user_id IS NOT NULL
    )
  );
