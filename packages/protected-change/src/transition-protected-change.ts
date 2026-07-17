import { auditAccessDenialOnFailure } from "@insecur/access";
import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  APPROVAL_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  type KnownErrorCode,
  type OrganizationId,
  type RequestId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import {
  assertImpactReviewFresh,
  assertRecordedImpactReviewFresh,
} from "./assert-impact-review-fresh.js";
import {
  assertApprovalEvidencePresent,
  assertProtectedChangeAccess,
  isProtectedChangeAccessDenied,
} from "./assert-protected-change-access.js";
import { isProtectedChangeError, ProtectedChangeError } from "./protected-change-errors.js";
import { computeDeliveryTargetFingerprint } from "./protected-delivery-target.js";
import type { ProtectedChangeAuditAction } from "./protected-change-audit-codes.js";
import { recordProtectedChangeAudit } from "./record-protected-change-audit.js";
import type {
  ProtectedChangeRecord,
  RecordProtectedChangeApprovalEvidenceInput,
  TransitionProtectedChangeInput,
} from "./protected-change-types.js";
import { recomputeProtectedChangeImpactFingerprint } from "./recompute-protected-change-impact-fingerprint.js";
import { TenantProtectedChangeStore } from "./tenant-protected-change-store.js";

export interface TransitionProtectedChangeRequestInput extends TransitionProtectedChangeInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly requestId: RequestId;
  readonly accessAction: Parameters<typeof assertProtectedChangeAccess>[0]["action"];
  readonly auditAction: ProtectedChangeAuditAction;
  /**
   * Approval evidence metadata. `deliveryTargetFingerprint` is deliberately not accepted here:
   * for a `delivery_config` change the approval transition computes it server-side from the
   * record's stored delivery target (INS-608).
   */
  readonly approvalEvidence?: Omit<
    RecordProtectedChangeApprovalEvidenceInput,
    "organizationId" | "protectedChangeId" | "deliveryTargetFingerprint"
  >;
  readonly deps?: AuthorizeScopeDeps;
}

async function loadRecord(
  organizationId: OrganizationId,
  protectedChangeId: RequestId,
): Promise<ProtectedChangeRecord> {
  const record = await withTenantScope({ kind: "organization", organizationId }, ({ sql }) =>
    new TenantProtectedChangeStore(sql).getById(organizationId, protectedChangeId),
  );
  if (record === null) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.notFound,
      "protected change not found",
    );
  }
  return record;
}

function transitionDeniedReasonCode(error: unknown): KnownErrorCode | undefined {
  if (isProtectedChangeError(error)) {
    return error.code;
  }
  const approvalCode = approvalErrorCode(error);
  if (approvalCode !== undefined) {
    return approvalCode;
  }
  return undefined;
}

function approvalErrorCode(error: unknown): KnownErrorCode | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return Object.values(APPROVAL_ERROR_CODES).includes(
    code as (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES],
  )
    ? (code as KnownErrorCode)
    : undefined;
}

export function isApprovalReviewStaleError(error: unknown): boolean {
  return approvalErrorCode(error) === APPROVAL_ERROR_CODES.reviewStale;
}

async function recordTransitionDenied(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
  error: unknown,
): Promise<void> {
  const reasonCode = transitionDeniedReasonCode(error);
  await recordProtectedChangeAudit({
    action: input.auditAction,
    outcome: "denied",
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: current.projectId,
    environmentId: current.environmentId,
    protectedChangeId: input.protectedChangeId,
    fromState: current.state,
    toState: input.nextState,
    ...(reasonCode === undefined ? {} : { reasonCode }),
  });
}

/**
 * The approval-time delivery-target fingerprint for a `delivery_config` change (INS-608). It is
 * computed here, from the record's server-stored coordinate and delivery target — never from
 * caller input — so the enforcement seam's exact-target match binds the approval to the exact
 * execution the requester proposed.
 */
async function serverComputedDeliveryTargetFingerprint(
  current: ProtectedChangeRecord,
): Promise<string | undefined> {
  if (current.deliveryTarget === null) {
    return undefined;
  }
  return computeDeliveryTargetFingerprint({
    organizationId: current.organizationId,
    projectId: current.projectId,
    environmentId: current.environmentId,
    kind: current.deliveryTarget.kind,
    targetId: current.deliveryTarget.targetId,
  });
}

async function persistTransition(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
): Promise<ProtectedChangeRecord> {
  const deliveryTargetFingerprint =
    input.nextState === "approved" && input.approvalEvidence !== undefined
      ? await serverComputedDeliveryTargetFingerprint(current)
      : undefined;

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const store = new TenantProtectedChangeStore(sql);
      const transitioned = await store.applyTransition(input);
      if (input.nextState === "approved" && input.approvalEvidence !== undefined) {
        await store.insertApprovalEvidence({
          organizationId: input.organizationId,
          protectedChangeId: input.protectedChangeId,
          ...input.approvalEvidence,
          ...(deliveryTargetFingerprint === undefined ? {} : { deliveryTargetFingerprint }),
        });
      }
      return transitioned;
    },
  );
}

async function assertTransitionAccess(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
): Promise<void> {
  if (input.nextState === "approved") {
    assertApprovalEvidencePresent(input.impactReviewFingerprint);
  }

  try {
    await assertProtectedChangeAccess({
      action: input.accessAction,
      actor: input.actor,
      auditActor: input.auditActor,
      coordinate: {
        organizationId: input.organizationId,
        projectId: current.projectId,
        environmentId: current.environmentId,
      },
      requestId: input.requestId,
      record: current,
      ...(input.deps === undefined ? {} : { deps: input.deps }),
    });
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isProtectedChangeAccessDenied,
      recordDenied: async () => recordTransitionDenied(input, current, error),
    });
    throw error;
  }
}

async function assertFreshImpactReviewForTransition(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
): Promise<void> {
  if (input.nextState !== "approved" && input.nextState !== "executing") {
    return;
  }

  // TOCTOU bound (INS-496): impact facts are recomputed in this transaction scope, then the
  // compare-and-set write runs in a separate call. A concurrent draft/delivery mutation between
  // the freshness pass and applyTransition is not re-detected here; the window is narrow and
  // bounded by the protected-change state machine CAS on the row itself.
  const currentFingerprint = await recomputeProtectedChangeImpactFingerprint(current);

  if (input.nextState === "approved") {
    assertImpactReviewFresh({
      submittedFingerprint: input.impactReviewFingerprint,
      currentFingerprint,
    });
    return;
  }

  const evidence = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ sql }) =>
      new TenantProtectedChangeStore(sql).getApprovalEvidence(
        input.organizationId,
        input.protectedChangeId,
      ),
  );
  if (evidence === null) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "approval evidence is required for execution",
    );
  }

  assertRecordedImpactReviewFresh({
    recordedFingerprint: evidence.impactReviewFingerprint,
    currentFingerprint,
  });
}

export async function transitionProtectedChange(
  input: TransitionProtectedChangeRequestInput,
): Promise<ProtectedChangeRecord> {
  const current = await loadRecord(input.organizationId, input.protectedChangeId);

  await assertTransitionAccess(input, current);

  try {
    await assertFreshImpactReviewForTransition(input, current);
  } catch (error) {
    await recordTransitionDenied(input, current, error);
    throw error;
  }

  let updated: ProtectedChangeRecord;
  try {
    updated = await persistTransition(input, current);
  } catch (error) {
    if (isProtectedChangeError(error)) {
      await recordProtectedChangeAudit({
        action: input.auditAction,
        outcome: "denied",
        actor: input.auditActor,
        organizationId: input.organizationId,
        projectId: current.projectId,
        environmentId: current.environmentId,
        protectedChangeId: input.protectedChangeId,
        fromState: current.state,
        toState: input.nextState,
        reasonCode: error.code,
      });
    }
    throw error;
  }

  await recordProtectedChangeAudit({
    action: input.auditAction,
    outcome: "success",
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: current.projectId,
    environmentId: current.environmentId,
    protectedChangeId: input.protectedChangeId,
    fromState: current.state,
    toState: updated.state,
  });

  return updated;
}
