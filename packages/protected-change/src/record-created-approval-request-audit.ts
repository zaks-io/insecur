import type { ActorRef } from "@insecur/access";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

import { toAuditActor } from "./to-audit-actor.js";

async function recordCreatedApprovalRequestAudit(input: {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: string;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordApprovalAudit({
    action: "request_created",
    outcome: "success",
    actor: toAuditActor(input.actor),
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
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: string;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordCreatedApprovalRequestAudit(input);
}
