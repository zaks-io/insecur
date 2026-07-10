import type { AuditActorRef } from "@insecur/audit";
import type { EvaluateHighAssuranceChallengeClearInput } from "@insecur/auth";
import { evaluateHighAssuranceChallengeClearAssurance } from "@insecur/auth";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  TenantApprovalRequestStore,
  TenantSecretVersionStore,
  withTenantScope,
} from "@insecur/tenant-store";
import type { ActorRef } from "@insecur/access";

import {
  assertImpactReviewFresh,
  assertRecordedImpactReviewFresh,
} from "./assert-impact-review-fresh.js";
import { assertApprovalRequestApproveAccess } from "./approval-request-review-access.js";
import { ApprovalRequestError } from "./approval-request-errors.js";
import {
  loadDraftTargetsForRequest,
  resolveCurrentImpactFingerprint,
} from "./approval-request-impact-review.js";
import { loadApprovalRequestForReviewDecision } from "./get-approval-request-review.js";
import { recordApprovalRequestSuccessAuditInTenantScope } from "./record-approval-request-success-audit.js";

export interface ApproveApprovalRequestInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly sessionAssurance: EvaluateHighAssuranceChallengeClearInput;
  readonly impactReviewFingerprint: string;
  readonly requestId: RequestId;
}

async function publishApprovedChangeSet(input: {
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly draftTargets: Awaited<ReturnType<typeof loadDraftTargetsForRequest>>;
  readonly auditActor: AuditActorRef;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
}): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db, sql }) => {
      await new TenantSecretVersionStore(db).publishVersions({
        organizationId: input.organizationId,
        targets: input.draftTargets,
      });
      const transitioned = await new TenantApprovalRequestStore(
        db,
      ).transitionPendingApprovalRequest({
        organizationId: input.organizationId,
        approvalRequestId: input.approvalRequestId,
        toStatus: "approved_applied",
      });
      if (!transitioned) {
        throw new ApprovalRequestError(
          AUTH_ERROR_CODES.insufficientScope,
          "approval request is not pending",
        );
      }
      await recordApprovalRequestSuccessAuditInTenantScope(sql, {
        action: "request_approved",
        auditActor: input.auditActor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        approvalRequestId: input.approvalRequestId,
        requestId: input.requestId,
      });
    },
  );
}

async function assertApproveAuthorization(
  input: ApproveApprovalRequestInput,
  row: Awaited<ReturnType<typeof loadApprovalRequestForReviewDecision>>,
): Promise<void> {
  if (input.actor.type !== "user") {
    throw new ApprovalRequestError(
      AUTH_ERROR_CODES.insufficientScope,
      "Missing required permission.",
    );
  }
  await assertApprovalRequestApproveAccess({
    accessActor: input.actor,
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
  });
}

export async function approveApprovalRequest(input: ApproveApprovalRequestInput): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly status: "approved_applied";
}> {
  assertFreshStepUpEvidence(input.sessionAssurance);

  const row = await loadApprovalRequestForReviewDecision(input);
  await assertApproveAuthorization(input, row);

  const draftTargets = await loadDraftTargetsForRequest({
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
  });
  const currentFingerprint = await resolveCurrentImpactFingerprint({
    organizationId: input.organizationId,
    row,
    draftTargets,
  });
  assertImpactReviewFresh({
    submittedFingerprint: input.impactReviewFingerprint,
    currentFingerprint,
  });
  assertRecordedImpactReviewFresh({
    recordedFingerprint: row.impactReviewFingerprint,
    currentFingerprint,
  });

  await publishApprovedChangeSet({
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
    draftTargets,
    auditActor: input.auditActor,
    projectId: row.projectId,
    environmentId: row.environmentId,
    requestId: input.requestId,
  });

  return { approvalRequestId: input.approvalRequestId, status: "approved_applied" };
}

function assertFreshStepUpEvidence(
  sessionAssurance: EvaluateHighAssuranceChallengeClearInput,
): void {
  const evaluated = evaluateHighAssuranceChallengeClearAssurance(sessionAssurance);
  if (!evaluated.ok) {
    throw Object.assign(new Error("Fresh step-up evidence is required."), {
      code: AUTH_ERROR_CODES.highAssuranceRequired,
    });
  }
}
