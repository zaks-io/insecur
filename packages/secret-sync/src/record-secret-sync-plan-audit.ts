import { PRODUCTION_AUDIT_EVENT_CODES, recordSyncAudit, writeAuditEvent } from "@insecur/audit";
import type { AuthErrorCode, KnownErrorCode, OperationId, SecretSyncId } from "@insecur/domain";

import {
  secretSyncResource,
  toBindingAuditDetails,
  type SecretSyncAuditScope,
  type SecretSyncBindingAuditDetails,
} from "./record-secret-sync-audit.js";
import type { SecretSyncPlan } from "./secret-sync-plan.js";

/**
 * Indexed metadata-only plan details (ADR-0068 guard-compatible): opaque IDs,
 * stable dotted lookup statuses, booleans, and counts. Never provider-side
 * destination names or Sensitive Values.
 */
export function toPlanBindingAuditDetails(plan: SecretSyncPlan): SecretSyncBindingAuditDetails {
  const details: Record<string, string | number | boolean> = {
    ...toBindingAuditDetails({
      bindings: plan.bindings.map((binding) => ({
        id: binding.bindingId,
        secretId: binding.secretId,
      })),
    }),
    overwriteWarningCount: plan.overwriteWarningCount,
    ...(plan.deployImpact !== null ? { deployImpact: plan.deployImpact } : {}),
  };
  plan.bindings.forEach((binding, index) => {
    const ordinal = String(index + 1);
    details[`lookupStatus${ordinal}`] = binding.lookupStatus;
    details[`overwriteWarning${ordinal}`] = binding.overwriteWarning;
  });
  plan.warningCodes.forEach((warningCode, index) => {
    details[`warningCode${String(index + 1)}`] = warningCode;
  });
  return details;
}

export async function recordSecretSyncPlanCompleted(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly details: SecretSyncBindingAuditDetails;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncPlanCompleted,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    details: input.details,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

export async function recordSecretSyncPlanDenied(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
  },
): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncPlanDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

/**
 * Records a metadata-only Sync Execution Revalidation denial. A successful
 * revalidation writes nothing (see `recordSyncAudit`); every failed
 * revalidation leaves this auditable record while provider state is unchanged.
 */
export async function recordSecretSyncRevalidationDenied(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly operationId: OperationId;
    readonly reasonCode: KnownErrorCode;
  },
): Promise<void> {
  await recordSyncAudit({
    phase: "revalidation",
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    operationId: input.operationId,
    reasonCode: input.reasonCode,
    ...(input.request !== undefined ? { requestId: input.request.requestId } : {}),
  });
}
