import type { LocalAuditEventInput, LocalAuditEventRow } from "./types.js";

/** Tamperable metadata-only audit trail for Local Mode convenience. */
export interface LocalAuditWriter {
  writeEvent(input: LocalAuditEventInput): Promise<{ auditEventId: string }>;
  listEvents(projectId?: string): Promise<readonly LocalAuditEventRow[]>;
}
