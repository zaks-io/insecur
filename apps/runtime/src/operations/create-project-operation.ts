import { type OrganizationId, type ProjectId } from "@insecur/domain";
import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type ActorRef,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  TenantProjectMetadataStore,
  isUniqueConstraintViolation,
  toIsoTimestamp,
  withTenantScope,
} from "@insecur/tenant-store";
import type { CreateProjectRpcInput, CreateProjectRpcPayload } from "@insecur/worker-kit";

import {
  assertUserOrganizationMembership,
  insufficientScopeError,
  resourceConflictError,
} from "./metadata-operation-shared.js";

export interface CreateProjectOperationInput {
  readonly input: CreateProjectRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function toProjectMetadataRead(row: {
  projectId: ProjectId;
  organizationId: OrganizationId;
  displayName: CreateProjectRpcPayload["displayName"];
  createdAt: Date;
}): CreateProjectRpcPayload {
  return {
    projectId: row.projectId,
    organizationId: row.organizationId,
    displayName: row.displayName,
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

/**
 * Creates a project with a client-minted opaque ID and Display Name metadata.
 * Requires organization membership and `project:configure` at the organization coordinate.
 */
export async function createProjectOperation({
  input,
  accessActor,
}: CreateProjectOperationInput): Promise<CreateProjectRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);

  const effectiveAccess = await resolveEffectiveAccess(accessActor, {
    organizationId: input.organizationId,
  });
  if (!hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.projectConfigure)) {
    throw insufficientScopeError();
  }

  try {
    const created = await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ db }) =>
        new TenantProjectMetadataStore(db).create({
          organizationId: input.organizationId,
          projectId: input.projectId,
          displayName: input.displayName,
        }),
    );
    return toProjectMetadataRead(created);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw resourceConflictError("project id already exists in organization");
    }
    throw error;
  }
}
