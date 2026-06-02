-- Tenant-qualified link: bootstrap claim first_organization must belong to the same instance.

ALTER TABLE organizations
  ADD CONSTRAINT organizations_instance_id_id_key UNIQUE (instance_id, id);

ALTER TABLE bootstrap_operator_claims
  ADD CONSTRAINT bootstrap_operator_claims_instance_id_first_organization_id_fkey
  FOREIGN KEY (instance_id, first_organization_id)
  REFERENCES organizations (instance_id, id);
