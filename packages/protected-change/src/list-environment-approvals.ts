import { resolveEffectiveAccess, AUTHORIZATION_SCOPES, type UserActorRef } from "@insecur/access";
import type { ApprovalRequestId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";

export interface ListEnvironmentApprovalsInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

export interface EnvironmentApprovalListItem {
  readonly approvalRequestId: ApprovalRequestId;
  readonly purpose: string;
  readonly status: string;
  readonly createdAt: string;
  readonly operationId: string | null;
}

export async function listEnvironmentApprovals(
  input: ListEnvironmentApprovalsInput,
): Promise<readonly EnvironmentApprovalListItem[]> {
  const effectiveAccess = await resolveEffectiveAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  if (!effectiveAccess.scopes.includes(AUTHORIZATION_SCOPES.environmentRead)) {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  const rows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantApprovalRequestStore(db).listEnvironmentApprovalRequests({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      }),
  );

  return rows.map((row) => ({
    approvalRequestId: row.approvalRequestId,
    purpose: row.purpose,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    operationId: row.operationId,
  }));
}
