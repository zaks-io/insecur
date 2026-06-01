-- First Value audit: stable result codes for success and denied attempts (FV-05).
ALTER TABLE audit_events
  ADD COLUMN result_code text NOT NULL DEFAULT 'audit.succeeded';

ALTER TABLE audit_events
  ALTER COLUMN result_code DROP DEFAULT;
