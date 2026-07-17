import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  type ActorRef,
  type AuthorizeScopeDeps,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  APPROVAL_ERROR_CODES,
  AUTH_ERROR_CODES,
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
import type {
  ProtectedChangeApprovalEvidence,
  ProtectedChangeRecord,
} from "./protected-change-types.js";

export interface EnforceProtectedDeliveryApprovalInput {
  /** The exact protected delivery execution being authorized. */
  readonly target: ProtectedDeliveryTarget;
  /** The Protected Change / Approval Request whose approval evidence must authorize this target. */
  readonly protectedChangeId: RequestId;
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

async function loadRecordAndEvidence(input: EnforceProtectedDeliveryApprovalInput): Promise<{
  readonly record: ProtectedChangeRecord;
  readonly evidence: ProtectedChangeApprovalEvidence;
}> {
  const { record, evidence } = await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    async ({ sql }) => {
      const store = new TenantProtectedChangeStore(sql);
      const [record, evidence] = await Promise.all([
        store.getById(input.target.organizationId, input.protectedChangeId),
        store.getApprovalEvidence(input.target.organizationId, input.protectedChangeId),
      ]);
      return { record, evidence };
    },
  );

  if (record === null || evidence === null) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "no approval evidence found for the requested protected delivery execution",
    );
  }
  return { record, evidence };
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

function alreadyConsumedDenial(): ProtectedChangeError {
  return new ProtectedChangeError(
    PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
    "approval evidence was already consumed by a protected delivery execution",
  );
}

/**
 * Atomically consumes the approval evidence so it authorizes exactly this one execution (INS-607).
 * The store compare-and-set on `consumed_at IS NULL` is the single-use authority: under concurrent
 * enforcement of the same evidence at most one caller wins the row update; every other caller
 * (concurrent or later replay) fails closed with `approval_not_authorized`.
 */
async function consumeApprovalEvidenceOrThrow(
  input: EnforceProtectedDeliveryApprovalInput,
  evidence: ProtectedChangeApprovalEvidence,
): Promise<void> {
  const consumed = await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    ({ sql }) =>
      new TenantProtectedChangeStore(sql).consumeApprovalEvidence({
        organizationId: input.target.organizationId,
        protectedChangeId: input.protectedChangeId,
        evidenceId: evidence.evidenceId,
      }),
  );
  if (consumed === null) {
    throw alreadyConsumedDenial();
  }
}

/**
 * The exact-target binding is TOCTOU-safe: the approved delivery-target fingerprint is read from the
 * authoritative approval-evidence row (server state), never from the caller. A caller who recomputes
 * `computeDeliveryTargetFingerprint(requestedTarget)` cannot satisfy this — the stored fingerprint
 * was captured at approval time over the exact approved coordinate, so a request for a different
 * tenant/project/environment/operation/target id produces a different live fingerprint and fails.
 */
async function assertExactTargetMatch(
  input: EnforceProtectedDeliveryApprovalInput,
  evidence: ProtectedChangeApprovalEvidence,
): Promise<void> {
  const approvedFingerprint = evidence.deliveryTargetFingerprint;
  if (approvedFingerprint === null || approvedFingerprint.length === 0) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
      "approval evidence carries no delivery-target authorization for this execution",
    );
  }

  const requestedFingerprint = await computeDeliveryTargetFingerprint(input.target);
  if (approvedFingerprint !== requestedFingerprint) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
      "approval evidence was not issued for the exact requested delivery target",
    );
  }
}

async function assertCurrentApprovalEvidence(
  record: ProtectedChangeRecord,
  evidence: ProtectedChangeApprovalEvidence,
): Promise<void> {
  const currentFingerprint = await recomputeProtectedChangeImpactFingerprint(record);
  assertRecordedImpactReviewFresh({
    recordedFingerprint: evidence.impactReviewFingerprint,
    currentFingerprint,
  });
}

function isApprovalErrorCode(code: unknown): code is KnownErrorCode {
  return Object.values(APPROVAL_ERROR_CODES).includes(
    code as (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES],
  );
}

function denialReasonCode(error: unknown): KnownErrorCode | undefined {
  if (error instanceof ProtectedChangeError) {
    return error.code;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === AUTH_ERROR_CODES.insufficientScope) {
      return AUTH_ERROR_CODES.insufficientScope;
    }
    if (isApprovalErrorCode(error.code)) {
      return error.code;
    }
  }
  return undefined;
}

/** The ordered gate sequence; every deny throws, and the final gate consumes the evidence. */
async function runEnforcementGates(input: EnforceProtectedDeliveryApprovalInput): Promise<void> {
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

  const { record, evidence } = await loadRecordAndEvidence(input);
  assertCoordinateMatchesTarget(record, input.target);
  assertApprovedState(record);
  if (evidence.consumedAt !== null) {
    throw alreadyConsumedDenial();
  }
  await assertExactTargetMatch(input, evidence);
  await assertCurrentApprovalEvidence(record, evidence);
  await consumeApprovalEvidenceOrThrow(input, evidence);
}

/**
 * Fail-closed enforcement seam for protected delivery execution (INS-87). Protected delivery
 * configuration changes, protected Secret Sync enable/run, and Cloudflare Worker Secret Deploy call
 * this immediately before executing. It requires CURRENT matching approval evidence from the
 * Protected Change Orchestrator + Human Approval Surface, scoped to the EXACT tenant, project,
 * Protected Environment, operation kind, and target id. The approved delivery-target fingerprint is
 * read from the authoritative approval-evidence row, never supplied by the caller.
 *
 * Denials fail closed with a stable, metadata-only, actionable error code and a denied audit:
 * missing evidence (`missing_evidence`), non-authorizing/rejected/canceled/stale-closed/consumed
 * state (`approval_not_authorized`), stale impact review (`approval.review_stale`), mismatched
 * target (`delivery_target_mismatch`), or a denied actor (`auth.insufficient_scope`). No Sensitive
 * Values appear in the verdict, audit, or thrown error.
 *
 * Approval evidence is single-use (INS-607): once every gate passes, enforcement atomically
 * consumes the evidence (compare-and-set on `consumed_at IS NULL`) before returning `authorized`,
 * so one approval authorizes exactly one protected execution. There is no window where the same
 * evidence authorizes two concurrent executions, and replay after execution — including later
 * reconfigurations, retargets, or repeat runs — fails closed with `approval_not_authorized` plus
 * the denied protected-delivery audit. Consumption happens at authorization time, which fails
 * closed: if the gated execution then fails, the burned evidence never re-authorizes and a fresh
 * approval is required.
 */
export async function enforceProtectedDeliveryApproval(
  input: EnforceProtectedDeliveryApprovalInput,
): Promise<ProtectedDeliveryApprovalVerdict> {
  try {
    await runEnforcementGates(input);
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
