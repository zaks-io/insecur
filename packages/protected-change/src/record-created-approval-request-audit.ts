import type { UserActorRef } from "@insecur/access";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

export async function recordCreatedApprovalRequestAudit(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: string;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordApprovalAudit({
    action: "request_created",
    outcome: "success",
    actor: input.actor,
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

export async function finalizeCreatedApprovalRequest(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: string;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordCreatedApprovalRequestAudit(input);
}
