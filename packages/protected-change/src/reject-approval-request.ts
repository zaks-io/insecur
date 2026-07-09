import type { AuditActorRef } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";
import { APPROVAL_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";

import { assertApprovalRequestRejectAccess } from "./approval-request-review-access.js";
import { ApprovalRequestError } from "./approval-request-errors.js";
import { loadApprovalRequestForReviewDecision } from "./get-approval-request-review.js";
import { recordApprovalRequestSuccessAudit } from "./record-approval-request-success-audit.js";

export interface RejectApprovalRequestInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}

export async function rejectApprovalRequest(input: RejectApprovalRequestInput): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly status: "rejected";
}> {
  const row = await loadApprovalRequestForReviewDecision(input);

  await assertApprovalRequestRejectAccess({
    accessActor: input.actor,
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
  });

  const transitioned = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantApprovalRequestStore(db).transitionPendingApprovalRequest({
        organizationId: input.organizationId,
        approvalRequestId: input.approvalRequestId,
        toStatus: "rejected",
      }),
  );
  if (!transitioned) {
    throw new ApprovalRequestError(
      APPROVAL_ERROR_CODES.requestNotPending,
      "approval request is not pending",
    );
  }

  await recordRejectedApprovalRequestAudit({
    auditActor: input.auditActor,
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });

  return { approvalRequestId: input.approvalRequestId, status: "rejected" };
}

async function recordRejectedApprovalRequestAudit(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordApprovalRequestSuccessAudit({
    action: "request_rejected",
    auditActor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });
}
