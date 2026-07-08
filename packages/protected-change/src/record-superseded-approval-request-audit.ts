import type { ActorRef } from "@insecur/access";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

import { toAuditActor } from "./to-audit-actor.js";

export async function recordSupersededApprovalRequestAudits(input: {
  readonly actor: ActorRef;
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
      actor: toAuditActor(input.actor),
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
