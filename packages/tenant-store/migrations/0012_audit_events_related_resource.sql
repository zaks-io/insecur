-- Metadata-only related resource for forensic reconstruction (e.g. delivered Secret Version on grant consume).
ALTER TABLE audit_events
  ADD COLUMN related_resource_type text,
  ADD COLUMN related_resource_id text;
