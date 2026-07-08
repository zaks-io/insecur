import type { ApprovalRequestDetailRow } from "@insecur/tenant-store";
import { operationId } from "@insecur/domain";

import type { ApprovalRequestReviewListItem } from "./approval-request-review-types.js";

export function toApprovalRequestReviewListItem(
  row: ApprovalRequestDetailRow,
): ApprovalRequestReviewListItem {
  return {
    approvalRequestId: row.approvalRequestId,
    purpose: row.purpose,
    status: row.status,
    projectId: row.projectId,
    environmentId: row.environmentId,
    requestedAt: row.createdAt.toISOString(),
    operationId: row.operationId === null ? null : operationId.brand(row.operationId),
    requestingUserId: row.requesterUserId,
    requestingMachineIdentityId: row.requesterMachineIdentityId,
  };
}
