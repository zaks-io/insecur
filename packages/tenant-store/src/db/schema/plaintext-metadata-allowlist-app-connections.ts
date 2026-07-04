import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** App Connection tables (ADR-0070 fragment). */
export const PLAINTEXT_METADATA_ALLOWLIST_APP_CONNECTIONS = {
  app_connections: {
    active_credential_id: { category: "opaque-id" },
    connection_method: { category: "type-code" },
    created_at: { category: "timestamp" },
    display_name: { category: "display-name" },
    id: { category: "opaque-id" },
    last_validation_checked_at: { category: "timestamp" },
    last_validation_outcome: { category: "status-code" },
    last_validation_reason_code: { category: "type-code" },
    org_id: { category: "opaque-id" },
    provider: { category: "type-code" },
    setup_user_id: { category: "actor-id" },
    status: { category: "status-code" },
    status_reason_code: { category: "type-code" },
    updated_at: { category: "timestamp" },
  },
} as const satisfies PlaintextMetadataAllowlist;
