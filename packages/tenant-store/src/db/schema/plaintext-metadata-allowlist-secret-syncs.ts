import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Secret Sync tables (ADR-0070 fragment, INS-76). */
export const PLAINTEXT_METADATA_ALLOWLIST_SECRET_SYNCS = {
  secret_syncs: {
    app_connection_id: { category: "opaque-id" },
    auto_sync_enabled: { category: "flag" },
    created_at: { category: "timestamp" },
    created_by_user_id: { category: "actor-id" },
    deleted_at: { category: "timestamp" },
    disabled_at: { category: "timestamp" },
    display_name: { category: "display-name" },
    environment_id: { category: "opaque-id" },
    github_provider_scope: { category: "type-code" },
    id: { category: "opaque-id" },
    kind: { category: "type-code" },
    mapping_behavior: { category: "type-code" },
    org_id: { category: "opaque-id" },
    project_id: { category: "opaque-id" },
    status: { category: "status-code" },
    target_github_environment_id: { category: "opaque-id" },
    target_repo_id: { category: "opaque-id" },
    updated_at: { category: "timestamp" },
  },
  secret_sync_bindings: {
    created_at: { category: "timestamp" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    secret_id: { category: "opaque-id" },
    secret_sync_id: { category: "opaque-id" },
    updated_at: { category: "timestamp" },
  },
} as const satisfies PlaintextMetadataAllowlist;
