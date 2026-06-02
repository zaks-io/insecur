-- Exact Secret Version bound at grant issue for consume-time delivery and audit reconstruction.
ALTER TABLE injection_grants
  ADD COLUMN secret_version_id text;
