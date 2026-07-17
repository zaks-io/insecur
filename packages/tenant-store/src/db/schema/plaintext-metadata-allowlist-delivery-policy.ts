import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Delivery Risk Policy tables (ADR-0070 fragment, INS-88). */
export const PLAINTEXT_METADATA_ALLOWLIST_DELIVERY_POLICY = {
  delivery_risk_policies: {
    created_at: { category: "timestamp" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    policy_version: { category: "count" },
    preset_key: { category: "type-code" },
    preset_version: { category: "count" },
    project_id: { category: "opaque-id" },
    selected_at: { category: "timestamp" },
    selected_by_user_id: { category: "actor-id" },
    updated_at: { category: "timestamp" },
  },
  preview_automation_opt_ins: {
    created_at: { category: "timestamp" },
    enabled_at: { category: "timestamp" },
    enabled_by_user_id: { category: "actor-id" },
    environment_id: { category: "opaque-id" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    project_id: { category: "opaque-id" },
    revoked_at: { category: "timestamp" },
    revoked_by_user_id: { category: "actor-id" },
    updated_at: { category: "timestamp" },
  },
} as const satisfies PlaintextMetadataAllowlist;
