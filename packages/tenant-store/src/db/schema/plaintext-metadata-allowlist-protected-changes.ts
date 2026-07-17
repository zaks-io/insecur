import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Protected Change Orchestrator tables (ADR-0070 fragment, INS-82). */
export const PLAINTEXT_METADATA_ALLOWLIST_PROTECTED_CHANGES = {
  protected_changes: {
    closure_reason_code: { category: "type-code" },
    created_at: { category: "timestamp" },
    delivery_target_id: { category: "opaque-id" },
    delivery_target_kind: { category: "type-code" },
    draft_version_ids: { category: "validated-payload" },
    environment_id: { category: "opaque-id" },
    execution_operation_id: { category: "opaque-id" },
    id: { category: "opaque-id" },
    impact_review_fingerprint: { category: "type-code" },
    org_id: { category: "opaque-id" },
    project_id: { category: "opaque-id" },
    purpose: { category: "type-code" },
    requester_machine_identity_id: { category: "actor-id" },
    requester_user_id: { category: "actor-id" },
    state: { category: "status-code" },
    updated_at: { category: "timestamp" },
  },
  protected_change_approval_evidence: {
    approver_user_id: { category: "actor-id" },
    audit_event_id: { category: "opaque-id" },
    consumed_at: { category: "timestamp" },
    created_at: { category: "timestamp" },
    delivery_target_fingerprint: { category: "type-code" },
    id: { category: "opaque-id" },
    impact_review_fingerprint: { category: "type-code" },
    operation_id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    protected_change_id: { category: "opaque-id" },
  },
} as const satisfies PlaintextMetadataAllowlist;
