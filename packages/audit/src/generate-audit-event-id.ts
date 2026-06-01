import { auditEventId, type AuditEventId } from "@insecur/domain";

export function generateAuditEventId(): AuditEventId {
  return auditEventId.generate();
}
