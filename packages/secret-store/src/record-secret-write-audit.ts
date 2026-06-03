import { recordStorageAudit, type RecordStorageAuditInput } from "@insecur/audit";

export type RecordSecretWriteAuditInput = RecordStorageAuditInput;

/** Records metadata-only non-protected secret write audit events. */
export async function recordSecretWriteAudit(input: RecordSecretWriteAuditInput) {
  return recordStorageAudit(input);
}
