import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  type ActorRef,
  type AuthorizeScopeDeps,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  APPROVAL_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  type KnownErrorCode,
  type RequestId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import { assertRecordedImpactReviewFresh } from "./assert-impact-review-fresh.js";
import { ProtectedChangeError } from "./protected-change-errors.js";
import type { ProtectedDeliveryTarget } from "./protected-delivery-target.js";
import { computeDeliveryTargetFingerprint } from "./protected-delivery-target.js";
import { recomputeProtectedChangeImpactFingerprint } from "./recompute-protected-change-impact-fingerprint.js";
import { recordProtectedDeliveryApprovalAudit } from "./record-protected-delivery-approval-audit.js";
import { TenantProtectedChangeStore } from "./tenant-protected-change-store.js";
import type { ProtectedChangeRecord } from "./protected-change-types.js";

export interface EnforceProtectedDeliveryApprovalInput {
  /** The exact protected delivery execution being authorized. */
  readonly target: ProtectedDeliveryTarget;
  /** The Protected Change / Approval Request whose approval evidence must authorize this target. */
  readonly protectedChangeId: RequestId;
  /**
   * The delivery target fingerprint the approval covered. Recorded when the delivery-config
   * Approval Request was created; a promotion approval never carries one, so it cannot authorize a
   * delivery execution. The enforcement recomputes the requested target's fingerprint and requires
   * an exact match, so approval for target A cannot authorize target B.
   */
  readonly approvedDeliveryTargetFingerprint: string | null | undefined;
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly requestId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}

export interface ProtectedDeliveryApprovalVerdict {
  readonly status: "authorized";
  readonly protectedChangeId: RequestId;
  readonly deliveryTargetKind: ProtectedDeliveryTarget["kind"];
}

function requiredActorScope(target: ProtectedDeliveryTarget) {
  return target.kind === "secret_sync_run"
    ? AUTHORIZATION_SCOPES.syncRun
    : AUTHORIZATION_SCOPES.secretProtectedDraftWrite;
}

async function loadRecord(
  input: EnforceProtectedDeliveryApprovalInput,
): Promise<ProtectedChangeRecord> {
  const record = await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    ({ sql }) =>
      new TenantProtectedChangeStore(sql).getById(
        input.target.organizationId,
        input.protectedChangeId,
      ),
  );
  if (record === null) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "no approval evidence found for the requested protected delivery execution",
    );
  }
  return record;
}

function assertCoordinateMatchesTarget(
  record: ProtectedChangeRecord,
  target: ProtectedDeliveryTarget,
): void {
  if (
    record.organizationId !== target.organizationId ||
    record.projectId !== target.projectId ||
    record.environmentId !== target.environmentId
  ) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
      "approval evidence coordinate does not match the requested delivery target",
    );
  }
}

function assertApprovedState(record: ProtectedChangeRecord): void {
  if (record.state !== "approved") {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
      `approval evidence is not in an authorizing state: ${record.state}`,
    );
  }
}

async function assertExactTargetMatch(input: EnforceProtectedDeliveryApprovalInput): Promise<void> {
  const requestedFingerprint = await computeDeliveryTargetFingerprint(input.target);
  if (
    input.approvedDeliveryTargetFingerprint === undefined ||
    input.approvedDeliveryTargetFingerprint === null ||
    input.approvedDeliveryTargetFingerprint.length === 0 ||
    input.approvedDeliveryTargetFingerprint !== requestedFingerprint
  ) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
      "approval evidence was not issued for the exact requested delivery target",
    );
  }
}

async function assertCurrentApprovalEvidence(
  input: EnforceProtectedDeliveryApprovalInput,
  record: ProtectedChangeRecord,
): Promise<void> {
  const evidence = await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    ({ sql }) =>
      new TenantProtectedChangeStore(sql).getApprovalEvidence(
        input.target.organizationId,
        input.protectedChangeId,
      ),
  );
  if (evidence === null) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "approval evidence is required for protected delivery execution",
    );
  }

  const currentFingerprint = await recomputeProtectedChangeImpactFingerprint(record);
  assertRecordedImpactReviewFresh({
    recordedFingerprint: evidence.impactReviewFingerprint,
    currentFingerprint,
  });
}

function denialReasonCode(error: unknown): KnownErrorCode | undefined {
  if (error instanceof ProtectedChangeError) {
    return error.code;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Object.values(APPROVAL_ERROR_CODES).includes(
      error.code as (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES],
    )
  ) {
    return error.code as KnownErrorCode;
  }
  return undefined;
}

/**
 * Fail-closed enforcement seam for protected delivery execution (INS-87). Protected delivery
 * configuration changes, protected Secret Sync enable/run, and Cloudflare Worker Secret Deploy call
 * this immediately before executing. It requires CURRENT matching approval evidence from the
 * Protected Change Orchestrator + Human Approval Surface, scoped to the EXACT tenant, project,
 * Protected Environment, operation kind, and target id.
 *
 * Denials fail closed with a stable, metadata-only, actionable error code and a denied audit:
 * missing evidence (`missing_evidence`), non-authorizing/rejected/canceled/stale-closed state
 * (`approval_not_authorized`), stale impact review (`approval.review_stale`), mismatched target
 * (`delivery_target_mismatch`), or a denied actor (`auth.insufficient_scope`). No Sensitive Values
 * appear in the verdict, audit, or thrown error.
 */
export async function enforceProtectedDeliveryApproval(
  input: EnforceProtectedDeliveryApprovalInput,
): Promise<ProtectedDeliveryApprovalVerdict> {
  try {
    await authorizeScopeOrThrow({
      actor: input.actor,
      auditActor: input.auditActor,
      coordinate: {
        organizationId: input.target.organizationId,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
      },
      requiredScope: requiredActorScope(input.target),
      requestId: input.requestId,
      ...(input.deps === undefined ? {} : { deps: input.deps }),
    });

    const record = await loadRecord(input);
    assertCoordinateMatchesTarget(record, input.target);
    assertApprovedState(record);
    await assertExactTargetMatch(input);
    await assertCurrentApprovalEvidence(input, record);
  } catch (error) {
    const reasonCode = denialReasonCode(error);
    try {
      await recordProtectedDeliveryApprovalAudit({
        outcome: "denied",
        actor: input.auditActor,
        target: input.target,
        ...(reasonCode === undefined ? {} : { reasonCode }),
      });
    } catch {
      // Preserve the fail-closed denial; audit availability must not change the enforcement result.
    }
    throw error;
  }

  await recordProtectedDeliveryApprovalAudit({
    outcome: "success",
    actor: input.auditActor,
    target: input.target,
  });

  return {
    status: "authorized",
    protectedChangeId: input.protectedChangeId,
    deliveryTargetKind: input.target.kind,
  };
}
