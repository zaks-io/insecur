import type { AuditActorRef } from "@insecur/audit";
import { recordApprovalAudit } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  KnownErrorCode,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

import { recordApprovalRequestSuccessAudit } from "./record-approval-request-success-audit.js";

async function recordCreatedApprovalRequestAudit(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}): Promise<void> {
  await recordApprovalRequestSuccessAudit({
    action: "request_created",
    auditActor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });
}

export async function finalizeCreatedApprovalRequest(input: {
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
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
