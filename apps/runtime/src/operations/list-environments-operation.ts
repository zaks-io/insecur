import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  TenantEnvironmentLifecycleStore,
  toIsoTimestamp,
  withTenantScope,
} from "@insecur/tenant-store";
import type { ListEnvironmentsRpcInput, ListEnvironmentsRpcPayload } from "@insecur/worker-kit";

import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

export interface ListEnvironmentsOperationInput {
  readonly input: ListEnvironmentsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

/**
 * Authorize-then-read for project environment metadata. Requires org membership plus
 * `project:read` and `environment:read` at the project coordinate.
 */
export async function listEnvironmentsOperation({
  input,
  auditActor,
  accessActor,
}: ListEnvironmentsOperationInput): Promise<ListEnvironmentsRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);

  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate,
    requiredScope: AUTHORIZATION_SCOPES.projectRead,
    requestId: input.requestId,
  });

  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate,
    requiredScope: AUTHORIZATION_SCOPES.environmentRead,
    requestId: input.requestId,
  });

  const environmentRows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      new TenantEnvironmentLifecycleStore(db).listByProject(input.organizationId, input.projectId),
  );

  return {
    environments: environmentRows.map((row) => ({
      environmentId: row.environmentId,
      organizationId: row.organizationId,
      projectId: row.projectId,
      displayName: row.displayName,
      lifecycleStage: row.lifecycleStage,
      isProtected: row.isProtected,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
  };
}
