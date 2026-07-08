import type { AuditEventId } from "@insecur/domain";
import {
  isUniqueConstraintViolation,
  withTenantScope,
  type TenantScopedSql,
} from "@insecur/tenant-store";
import { generateAuditEventId } from "./generate-audit-event-id.js";
import { insertAuditEventRow } from "./insert-audit-event-row.js";
import { emitAuditNotificationIfConfigured } from "./audit-notification-emitter.js";
import type { AuditEventInput } from "./audit-types.js";
import { resolveAuditResultCode, validateAuditEventInput } from "./validate-audit-event.js";

export interface AuditEventResult {
  auditEventId: AuditEventId;
}

async function insertValidatedAuditEvent(
  sql: TenantScopedSql,
  event: AuditEventInput,
  auditEventId: AuditEventId,
  options?: { readonly idempotent?: boolean },
): Promise<AuditEventResult> {
  validateAuditEventInput(event);

  const resultCode = resolveAuditResultCode(event);

  let inserted = true;
  try {
    await insertAuditEventRow(sql, auditEventId, event, resultCode);
  } catch (error) {
    if (options?.idempotent !== true || !isUniqueConstraintViolation(error)) {
      throw error;
    }
    inserted = false;
  }

  if (inserted && event.outcome === "success") {
    await emitAuditNotificationIfConfigured(event);
  }

  return { auditEventId };
}

/**
 * Records a tenant-qualified metadata-only audit event on an existing tenant-scoped transaction.
 */
export async function writeAuditEventInTenantScope(
  sql: TenantScopedSql,
  event: AuditEventInput,
): Promise<AuditEventResult> {
  return insertValidatedAuditEvent(sql, event, generateAuditEventId());
}

/**
 * Records a tenant-qualified metadata-only audit event with a caller-supplied opaque ID.
 * Duplicate IDs are treated as idempotent success.
 */
export async function writeAuditEventInTenantScopeWithId(
  sql: TenantScopedSql,
  event: AuditEventInput,
  auditEventId: AuditEventId,
): Promise<AuditEventResult> {
  return insertValidatedAuditEvent(sql, event, auditEventId, { idempotent: true });
}

/**
 * Records a tenant-qualified metadata-only audit event through the Tenant-Scoped Store.
 */
export async function writeAuditEvent(event: AuditEventInput): Promise<AuditEventResult> {
  return await withTenantScope(
    { kind: "organization", organizationId: event.organizationId },
    async ({ sql }) => {
      return writeAuditEventInTenantScope(sql, event);
    },
  );
}

/**
 * Records a tenant-qualified metadata-only audit event with a caller-supplied opaque ID.
 * Duplicate IDs are treated as idempotent success.
 */
export async function writeAuditEventWithId(
  event: AuditEventInput,
  auditEventId: AuditEventId,
): Promise<AuditEventResult> {
  return await withTenantScope(
    { kind: "organization", organizationId: event.organizationId },
    async ({ sql }) => {
      return writeAuditEventInTenantScopeWithId(sql, event, auditEventId);
    },
  );
}
