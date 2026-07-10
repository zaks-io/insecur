import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Restore-import journal (ADR-0070 fragment, ADR-0084 / INS-565). */
export const PLAINTEXT_METADATA_ALLOWLIST_RESTORE_IMPORT = {
  restore_import_journal: {
    only_row: { category: "flag" },
    instance_id: { category: "opaque-id" },
    artifact_ref: { category: "ciphertext-ref" },
    source_export_operation_id: { category: "opaque-id" },
    source_export_timestamp: { category: "timestamp" },
    status: { category: "status-code" },
    started_at: { category: "timestamp" },
    completed_at: { category: "timestamp" },
    organization_count: { category: "count" },
    manifest_organization_count: { category: "count" },
    skipped_organization_count: { category: "count" },
    dropped_bootstrap_claim_count: { category: "count" },
    imported_row_count: { category: "count" },
  },
} as const satisfies PlaintextMetadataAllowlist;
