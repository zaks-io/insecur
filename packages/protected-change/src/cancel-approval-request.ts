import type { UserActorRef } from "@insecur/access";
import { resolveEffectiveAccess } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  APPROVAL_ERROR_CODES,
  type ApprovalRequestId,
  type OrganizationId,
  type RequestId,
} from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";

import { assertRequesterCanCancel } from "./approval-request-review-access.js";
import { ApprovalRequestError } from "./approval-request-errors.js";
import { loadApprovalRequestForReviewDecision } from "./get-approval-request-review.js";
import { recordApprovalRequestSuccessAudit } from "./record-approval-request-success-audit.js";

export interface CancelApprovalRequestInput {
  readonly actor: UserActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}

export async function cancelApprovalRequest(input: CancelApprovalRequestInput): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly status: "canceled";
}> {
  const row = await loadApprovalRequestForReviewDecision(input);

  const access = await resolveEffectiveAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
  });
  assertRequesterCanCancel({ actor: input.actor, row, access });

  const transitioned = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantApprovalRequestStore(db).transitionPendingApprovalRequest({
        organizationId: input.organizationId,
        approvalRequestId: input.approvalRequestId,
        toStatus: "canceled",
      }),
  );
  if (!transitioned) {
    throw new ApprovalRequestError(
      APPROVAL_ERROR_CODES.requestNotPending,
      "approval request is not pending",
    );
  }

  await recordApprovalRequestSuccessAudit({
    action: "request_canceled",
    auditActor: input.auditActor,
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });

  return { approvalRequestId: input.approvalRequestId, status: "canceled" };
}
