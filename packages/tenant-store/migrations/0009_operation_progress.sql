-- Metadata-only workflow progress and audit references for Operation Store (PS-01).
ALTER TABLE operations
  ADD COLUMN progress jsonb NOT NULL DEFAULT '{}'::jsonb;
