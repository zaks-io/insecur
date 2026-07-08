/** Stable readiness control IDs for the Storage Security Gate. */
export const STORAGE_SECURITY_GATE_CONTROL_IDS = [
  "storage.root_key",
  "storage.root_key_escrow",
  "storage.tenant_data_keys",
  "storage.key_versions",
  "storage.keyring",
  "storage.tenant_store",
  "storage.secret_encryption",
  "storage.provider_credential_encryption",
  "storage.sensitive_metadata_encryption",
  "storage.no_plaintext_persistence",
  "storage.delivery_fail_closed",
] as const;

export type StorageSecurityGateControlId = (typeof STORAGE_SECURITY_GATE_CONTROL_IDS)[number];

export const STORAGE_SECURITY_GATE_CONTROL_DOCS = "docs/storage-security-gate.md" as const;
