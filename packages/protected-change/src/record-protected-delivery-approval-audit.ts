import {
  PRODUCTION_AUDIT_EVENT_CODES,
  recordActionAudit,
  type AuditActorRef,
  type AuditEventResult,
  type AuditResourceRef,
} from "@insecur/audit";
import {
  parseOpaqueResourceId,
  type KnownErrorCode,
  type OpaqueResourceIdPrefix,
} from "@insecur/domain";

import type { ProtectedDeliveryTarget } from "./protected-delivery-target.js";

export interface RecordProtectedDeliveryApprovalAuditInput {
  readonly outcome: "success" | "denied";
  readonly actor: AuditActorRef;
  readonly target: ProtectedDeliveryTarget;
  readonly reasonCode?: KnownErrorCode;
}

function opaqueId(value: string, expectedPrefix: OpaqueResourceIdPrefix) {
  const parsed = parseOpaqueResourceId(value, expectedPrefix);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

function deliveryTargetResource(target: ProtectedDeliveryTarget): AuditResourceRef {
  if (target.kind === "secret_sync_enable" || target.kind === "secret_sync_run") {
    return { type: "secret_sync", id: opaqueId(target.targetId, "sync") };
  }
  return { type: "environment", id: opaqueId(target.environmentId, "env") };
}

/**
 * Records the metadata-only verdict of a protected delivery approval enforcement check (INS-87).
 * Never carries Sensitive Values: only the delivery target kind, opaque ids, outcome, and the
 * stable denial reason code.
 */
export async function recordProtectedDeliveryApprovalAudit(
  input: RecordProtectedDeliveryApprovalAuditInput,
): Promise<AuditEventResult | undefined> {
  const eventCode =
    input.outcome === "success"
      ? PRODUCTION_AUDIT_EVENT_CODES.protectedDeliveryApprovalAuthorized
      : PRODUCTION_AUDIT_EVENT_CODES.protectedDeliveryApprovalDenied;

  return recordActionAudit({
    eventCode,
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.target.organizationId,
    projectId: input.target.projectId,
    environmentId: input.target.environmentId,
    resource: deliveryTargetResource(input.target),
    // Audit detail strings must be stable dotted codes (ADR-0068); the bare kind vocabulary
    // ("secret_sync_run") is not dotted and the real audit layer rejects it.
    details: { deliveryTargetKind: `delivery_target.${input.target.kind}` },
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  });
}
