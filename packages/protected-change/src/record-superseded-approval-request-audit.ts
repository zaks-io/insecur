import type { AuditActorRef } from "@insecur/audit";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

export async function recordSupersededApprovalRequestAudits(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly supersededApprovalRequestIds: readonly ApprovalRequestId[];
  readonly requestId: RequestId;
}): Promise<void> {
  for (const supersededApprovalRequestId of input.supersededApprovalRequestIds) {
    await recordApprovalAudit({
      action: "request_superseded",
      outcome: "success",
      actor: input.auditActor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      resource: {
        type: "approval_request",
        id: supersededApprovalRequestId as unknown as OpaqueResourceId,
      },
      requestId: input.requestId,
    });
  }
}
