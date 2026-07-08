import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Approval request tables (ADR-0070 fragment, INS-439). */
export const PLAINTEXT_METADATA_ALLOWLIST_APPROVALS = {
  approval_requests: {
    comment_length: { category: "count" },
    comment_sha256: { category: "verifier-material" },
    created_at: { category: "timestamp" },
    environment_id: { category: "opaque-id" },
    id: { category: "opaque-id" },
    impact_review_fingerprint: { category: "verifier-material" },
    operation_id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    project_id: { category: "opaque-id" },
    purpose: { category: "type-code" },
    requester_machine_identity_id: { category: "actor-id" },
    requester_user_id: { category: "actor-id" },
    rollback_promote_requested: { category: "flag" },
    rollback_secret_id: { category: "opaque-id" },
    rollback_to_version_number: { category: "count" },
    status: { category: "status-code" },
    superseded_by_request_id: { category: "opaque-id" },
    updated_at: { category: "timestamp" },
  },
  promotion_change_set_draft_versions: {
    approval_request_id: { category: "opaque-id" },
    created_at: { category: "timestamp" },
    org_id: { category: "opaque-id" },
    secret_id: { category: "opaque-id" },
    secret_version_id: { category: "opaque-id" },
  },
} as const satisfies PlaintextMetadataAllowlist;
