import { auditAccessDenialOnFailure } from "@insecur/access";
import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { PROTECTED_CHANGE_ERROR_CODES, type OrganizationId, type RequestId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

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

async function recordTransitionAccessDenied(
  input: TransitionProtectedChangeRequestInput,
  current: ProtectedChangeRecord,
  error: unknown,
): Promise<void> {
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
    ...(isProtectedChangeError(error) ? { reasonCode: error.code } : {}),
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
      recordDenied: async () => recordTransitionAccessDenied(input, current, error),
    });
    throw error;
  }
}

export async function transitionProtectedChange(
  input: TransitionProtectedChangeRequestInput,
): Promise<ProtectedChangeRecord> {
  const current = await loadRecord(input.organizationId, input.protectedChangeId);

  await assertTransitionAccess(input, current);

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
