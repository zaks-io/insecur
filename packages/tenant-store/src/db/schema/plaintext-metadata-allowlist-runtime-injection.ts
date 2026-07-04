import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Runtime Injection Policy tables (ADR-0070 fragment). */
export const PLAINTEXT_METADATA_ALLOWLIST_RUNTIME_INJECTION = {
  runtime_injection_policies: {
    active_version_id: { category: "opaque-id" },
    created_at: { category: "timestamp" },
    disabled_at: { category: "timestamp" },
    display_name: { category: "display-name" },
    environment_id: { category: "opaque-id" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    project_id: { category: "opaque-id" },
  },
  runtime_injection_policy_versions: {
    command: { category: "type-code" },
    command_fingerprint: { category: "type-code" },
    created_at: { category: "timestamp" },
    delivery_mode: { category: "type-code" },
    display_name_snapshot: { category: "display-name" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    policy_id: { category: "opaque-id" },
    secret_ids: { category: "opaque-id" },
    ttl_seconds: { category: "count" },
    variable_keys: { category: "plaintext-lookup-key" },
    version_number: { category: "count" },
  },
} as const satisfies PlaintextMetadataAllowlist;
