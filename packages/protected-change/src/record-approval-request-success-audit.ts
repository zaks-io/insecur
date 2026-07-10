import type { ApprovalAuditAction, AuditActorRef, RecordApprovalAuditInput } from "@insecur/audit";
import { recordApprovalAudit, recordApprovalAuditInTenantScope } from "@insecur/audit";
import type {
  ApprovalRequestId,
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

type ApprovalRequestSuccessAuditAction = Exclude<ApprovalAuditAction, "action_denied">;

interface ApprovalRequestSuccessAuditInput {
  readonly action: ApprovalRequestSuccessAuditAction;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}

function toApprovalAuditInput(input: ApprovalRequestSuccessAuditInput): RecordApprovalAuditInput {
  return {
    action: input.action,
    outcome: "success" as const,
    actor: input.auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: {
      type: "approval_request",
      id: input.approvalRequestId as unknown as OpaqueResourceId,
    },
    requestId: input.requestId,
  };
}

export async function recordApprovalRequestSuccessAudit(
  input: ApprovalRequestSuccessAuditInput,
): Promise<void> {
  await recordApprovalAudit(toApprovalAuditInput(input));
}

export async function recordApprovalRequestSuccessAuditInTenantScope(
  sql: TenantScopedSql,
  input: ApprovalRequestSuccessAuditInput,
): Promise<void> {
  await recordApprovalAuditInTenantScope(sql, toApprovalAuditInput(input));
}
