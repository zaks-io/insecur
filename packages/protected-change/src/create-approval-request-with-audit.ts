import type { UserActorRef } from "@insecur/access";
import { approvalRequestId, type ApprovalRequestId, type RequestId } from "@insecur/domain";

import { finalizeCreatedApprovalRequest } from "./record-created-approval-request-audit.js";

export interface ApprovalRequestAuditScope {
  readonly actor: UserActorRef;
  readonly organizationId: Parameters<typeof finalizeCreatedApprovalRequest>[0]["organizationId"];
  readonly projectId: Parameters<typeof finalizeCreatedApprovalRequest>[0]["projectId"];
  readonly environmentId: Parameters<typeof finalizeCreatedApprovalRequest>[0]["environmentId"];
  readonly requestId: RequestId;
}

export async function createApprovalRequestWithAudit<T>(input: {
  readonly audit: ApprovalRequestAuditScope;
  readonly persist: (createdApprovalRequestId: ApprovalRequestId) => Promise<T>;
}): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly result: T;
}> {
  const createdApprovalRequestId = approvalRequestId.generate();
  const result = await input.persist(createdApprovalRequestId);
  await finalizeCreatedApprovalRequest({
    ...input.audit,
    approvalRequestId: createdApprovalRequestId,
  });
  return { approvalRequestId: createdApprovalRequestId, result };
}
