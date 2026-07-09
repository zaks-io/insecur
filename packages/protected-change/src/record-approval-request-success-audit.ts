import type { ApprovalAuditAction, AuditActorRef } from "@insecur/audit";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

type ApprovalRequestSuccessAuditAction = Exclude<ApprovalAuditAction, "action_denied">;

export async function recordApprovalRequestSuccessAudit(input: {
  readonly action: ApprovalRequestSuccessAuditAction;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordApprovalAudit({
    action: input.action,
    outcome: "success",
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: {
      type: "approval_request",
      id: input.approvalRequestId as unknown as OpaqueResourceId,
    },
    requestId: input.requestId,
  });
}
