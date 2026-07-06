import { AUTH_ERROR_CODES, type OrganizationId, type ProjectId } from "@insecur/domain";
import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  hasAuthorizationScope,
  resolveEffectiveAccessBatch,
  type ActorRef,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { TenantProjectMetadataStore, toIsoTimestamp, withTenantScope } from "@insecur/tenant-store";
import type { ListProjectsRpcInput, ListProjectsRpcPayload } from "@insecur/worker-kit";

export interface ListProjectsOperationInput {
  readonly input: ListProjectsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

function toProjectMetadataRead(row: {
  projectId: ProjectId;
  organizationId: OrganizationId;
  displayName: ListProjectsRpcPayload["projects"][number]["displayName"];
  createdAt: Date;
}): ListProjectsRpcPayload["projects"][number] {
  return {
    projectId: row.projectId,
    organizationId: row.organizationId,
    displayName: row.displayName,
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

/**
 * Authorize-then-read for org project metadata. Membership is required; returned projects are
 * filtered to coordinates where the actor holds `project:read`. An empty org returns an empty list;
 * a non-empty org with no readable projects is a scope denial.
 */
export async function listProjectsOperation({
  input,
  accessActor,
}: ListProjectsOperationInput): Promise<ListProjectsRpcPayload> {
  if (accessActor.type !== "user") {
    throw insufficientScopeError();
  }

  await assertOrganizationMembership(accessActor, input.organizationId);

  const projectRows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => new TenantProjectMetadataStore(db).listByOrganization(input.organizationId),
  );

  if (projectRows.length === 0) {
    return { projects: [] };
  }

  const coordinates = projectRows.map((row) => ({
    organizationId: input.organizationId,
    projectId: row.projectId,
  }));
  const effectiveAccess = await resolveEffectiveAccessBatch(accessActor, coordinates);

  const projects = projectRows.flatMap((row, index) => {
    const access = effectiveAccess[index];
    if (access === undefined || !hasAuthorizationScope(access, AUTHORIZATION_SCOPES.projectRead)) {
      return [];
    }
    return [toProjectMetadataRead(row)];
  });

  if (projects.length === 0) {
    throw insufficientScopeError();
  }

  return { projects };
}
