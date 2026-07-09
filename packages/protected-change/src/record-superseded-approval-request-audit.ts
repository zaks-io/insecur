import type { AuditActorRef } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

import { recordApprovalRequestSuccessAudit } from "./record-approval-request-success-audit.js";

export async function recordSupersededApprovalRequestAudits(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly supersededApprovalRequestIds: readonly ApprovalRequestId[];
  readonly requestId: RequestId;
}): Promise<void> {
  for (const supersededApprovalRequestId of input.supersededApprovalRequestIds) {
    await recordApprovalRequestSuccessAudit({
      action: "request_superseded",
      auditActor: input.auditActor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      approvalRequestId: supersededApprovalRequestId,
      requestId: input.requestId,
    });
  }
}
