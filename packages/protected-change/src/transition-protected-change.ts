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

import { assertImpactReviewFresh } from "./assert-impact-review-fresh.js";
import {
  assertApprovalEvidencePresent,
  assertProtectedChangeAccess,
  isProtectedChangeAccessDenied,
} from "./assert-protected-change-access.js";
import { isProtectedChangeError, ProtectedChangeError } from "./protected-change-errors.js";
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
  readonly approvalEvidence?: Omit<
    RecordProtectedChangeApprovalEvidenceInput,
    "organizationId" | "protectedChangeId"
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
  if (isApprovalReviewStaleError(error)) {
    return APPROVAL_ERROR_CODES.reviewStale;
  }
  return undefined;
}

export function isApprovalReviewStaleError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === APPROVAL_ERROR_CODES.reviewStale
  );
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

async function persistTransition(
  input: TransitionProtectedChangeRequestInput,
): Promise<ProtectedChangeRecord> {
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

async function resolveCurrentImpactFingerprint(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
): Promise<string> {
  if (input.currentImpactFingerprint !== undefined) {
    return input.currentImpactFingerprint;
  }
  return recomputeProtectedChangeImpactFingerprint(current);
}

async function assertFreshImpactReviewForTransition(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
): Promise<void> {
  if (input.nextState !== "approved" && input.nextState !== "executing") {
    return;
  }

  const currentFingerprint = await resolveCurrentImpactFingerprint(input, current);

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

  assertImpactReviewFresh({
    submittedFingerprint: evidence.impactReviewFingerprint,
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
    updated = await persistTransition(input);
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
