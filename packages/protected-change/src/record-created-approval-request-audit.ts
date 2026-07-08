import type { AuditActorRef } from "@insecur/audit";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  EnvironmentId,
  KnownErrorCode,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

async function recordCreatedApprovalRequestAudit(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: string;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordApprovalAudit({
    action: "request_created",
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

export async function finalizeCreatedApprovalRequest(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: string;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordCreatedApprovalRequestAudit(input);
}

/**
 * Records a metadata-only denied `request_created` audit for an Approval Request that failed the
 * create-access check, mirroring `recordCreateAccessDenied` in create-protected-change.ts. No
 * resource id is attached because the request was never created; `reasonCode` carries the denial.
 */
export async function recordDeniedApprovalRequestCreate(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
  readonly reasonCode?: KnownErrorCode;
}): Promise<void> {
  await recordApprovalAudit({
    action: "request_created",
    outcome: "denied",
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requestId: input.requestId,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  });
}
