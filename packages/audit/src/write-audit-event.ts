import type { AuditEventId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { generateAuditEventId } from "./generate-audit-event-id.js";
import { insertAuditEventRow } from "./insert-audit-event-row.js";
import type { AuditEventInput } from "./audit-types.js";
import { resolveAuditResultCode, validateAuditEventInput } from "./validate-audit-event.js";

export interface AuditEventResult {
  auditEventId: AuditEventId;
}

/**
 * Records a tenant-qualified metadata-only audit event through the Tenant-Scoped Store.
 */
export async function writeAuditEvent(event: AuditEventInput): Promise<AuditEventResult> {
  validateAuditEventInput(event);

  const auditEventId = generateAuditEventId();
  const resultCode = resolveAuditResultCode(event);

  await withTenantScope(
    { kind: "organization", organizationId: event.organizationId },
    async (sql) => {
      await insertAuditEventRow(sql, auditEventId, event, resultCode);
    },
  );

  return { auditEventId };
}
