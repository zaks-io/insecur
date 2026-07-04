import { recordSecretStorageWriteAudit } from "./record-secret-storage-write-audit.js";

export type RecordSecretWriteAuditInput = Parameters<typeof recordSecretStorageWriteAudit>[1];

/** Records metadata-only non-protected secret write audit events. */
export async function recordSecretWriteAudit(input: RecordSecretWriteAuditInput) {
  return recordSecretStorageWriteAudit("non_protected", input);
}
