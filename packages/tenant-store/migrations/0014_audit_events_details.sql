-- Metadata-only audit detail map (Plaintext Metadata Allowlist validated before insert).
ALTER TABLE audit_events
  ADD COLUMN details jsonb;
