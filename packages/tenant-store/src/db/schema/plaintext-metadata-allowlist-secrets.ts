import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Secret Version lifecycle tables (ADR-0070 fragment). */
export const PLAINTEXT_METADATA_ALLOWLIST_SECRETS = {
  secret_versions: {
    ciphertext_storage_ref: { category: "ciphertext-ref" },
    created_at: { category: "timestamp" },
    id: { category: "opaque-id" },
    lifecycle_state: { category: "type-code" },
    org_id: { category: "opaque-id" },
    organization_data_key_version: { category: "key-version" },
    project_data_key_version: { category: "key-version" },
    published_at: { category: "timestamp" },
    secret_id: { category: "opaque-id" },
    version_number: { category: "count" },
  },
  secrets: {
    created_at: { category: "timestamp" },
    current_version_id: { category: "opaque-id" },
    environment_id: { category: "opaque-id" },
    id: { category: "opaque-id" },
    live_version_number: { category: "count" },
    org_id: { category: "opaque-id" },
    project_id: { category: "opaque-id" },
    variable_key: { category: "type-code" },
  },
} as const satisfies PlaintextMetadataAllowlist;
