-- Authoritative exact-secret bindings for one-use Injection Grant consume (metadata only).
ALTER TABLE injection_grants
  ADD COLUMN secret_ids text[] NOT NULL DEFAULT '{}';
