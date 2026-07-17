import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import type { KnownErrorCode, OperationId, SecretSyncId, SecretSyncKind } from "@insecur/domain";

import {
  secretSyncResource,
  type SecretSyncAuditScope,
  type SecretSyncBindingAuditDetails,
} from "./record-secret-sync-audit.js";
import { syncDeployImpact } from "./secret-sync-plan.js";

/**
 * Indexed metadata-only run summary (ADR-0068 guard-compatible): opaque
 * binding/secret ids, stable dotted per-binding write statuses, counts, and
 * the provider deploy-impact label where the write set is a production
 * deploy. Never Sensitive Values, provider destination names, Worker script
 * names, or raw provider bodies.
 */
export function toRunBindingAuditDetails(
  results: readonly {
    readonly bindingId: string;
    readonly secretId: string;
    readonly writeStatus: string;
  }[],
  counters: Readonly<Record<string, number>>,
  syncKind?: SecretSyncKind,
): SecretSyncBindingAuditDetails {
  const deployImpact = syncKind !== undefined ? syncDeployImpact(syncKind) : null;
  const details: Record<string, string | number | boolean> = {
    bindingCount: results.length,
    ...counters,
    ...(deployImpact !== null ? { deployImpact } : {}),
  };
  results.forEach((result, index) => {
    const ordinal = String(index + 1);
    details[`bindingId${ordinal}`] = result.bindingId;
    details[`secretId${ordinal}`] = result.secretId;
    details[`writeStatus${ordinal}`] = result.writeStatus;
  });
  return details;
}

/** Sync execution completion audit: per-binding write/verify summary, metadata only. */
export async function recordSecretSyncRunCompleted(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly operationId: OperationId;
    readonly details: SecretSyncBindingAuditDetails;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    operation: { operationId: input.operationId },
    details: input.details,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

/**
 * Sync execution denial/failure audit: pre-write blocks, provider write
 * failures, stale fencing, and cancellation-path denials all land here with
 * a stable reason code and the Operation ID for correlation.
 */
export async function recordSecretSyncRunDenied(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly operationId: OperationId;
    readonly reasonCode: KnownErrorCode;
    readonly details?: SecretSyncBindingAuditDetails;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    operation: { operationId: input.operationId },
    denial: { reasonCode: input.reasonCode },
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}
