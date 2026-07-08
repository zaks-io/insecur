import type { AuditActorRef } from "@insecur/audit";
import type { ApprovalRequestId, OrganizationId, RequestId } from "@insecur/domain";
import { resolveEffectiveAccess } from "@insecur/access";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { assertRequesterCanCancel } from "./approval-request-review-access.js";
import { ApprovalRequestError } from "./approval-request-errors.js";
import { APPROVAL_ERROR_CODES } from "@insecur/domain";
import { loadApprovalRequestForReviewDecision } from "./get-approval-request-review.js";

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

  return { approvalRequestId: input.approvalRequestId, status: "canceled" };
}
