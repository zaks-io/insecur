import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  TenantEnvironmentLifecycleStore,
  copyEnvironmentSecretShapes,
  isUniqueConstraintViolation,
  toIsoTimestamp,
  withTenantScope,
} from "@insecur/tenant-store";
import type { CreateEnvironmentRpcInput, CreateEnvironmentRpcPayload } from "@insecur/worker-kit";

import {
  assertUserOrganizationMembership,
  resourceConflictError,
} from "./metadata-operation-shared.js";

export interface CreateEnvironmentOperationInput {
  readonly input: CreateEnvironmentRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function environmentNotFoundError(): Error & { code: typeof ENVIRONMENT_ERROR_CODES.notFound } {
  return Object.assign(new Error("source environment not found in project"), {
    code: ENVIRONMENT_ERROR_CODES.notFound,
  });
}

function toEnvironmentMetadataRead(
  row: {
    environmentId: EnvironmentId;
    organizationId: OrganizationId;
    projectId: ProjectId;
    displayName: CreateEnvironmentRpcPayload["displayName"];
    lifecycleStage: CreateEnvironmentRpcPayload["lifecycleStage"];
    isProtected: boolean;
    createdAt: Date;
  },
  copiedShapeCount: number,
): CreateEnvironmentRpcPayload {
  return {
    environmentId: row.environmentId,
    organizationId: row.organizationId,
    projectId: row.projectId,
    displayName: row.displayName,
    lifecycleStage: row.lifecycleStage,
    isProtected: row.isProtected,
    createdAt: toIsoTimestamp(row.createdAt),
    copiedShapeCount,
  };
}

function assertCopySourceEnvironment(
  source: { projectId: ProjectId } | null,
  projectIdValue: ProjectId,
): void {
  if (source?.projectId !== projectIdValue) {
    throw environmentNotFoundError();
  }
}

async function createEnvironmentInScope(
  input: CreateEnvironmentRpcInput,
): Promise<CreateEnvironmentRpcPayload> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const environmentStore = new TenantEnvironmentLifecycleStore(db);

      if (input.copyShapesFromEnvironmentId !== undefined) {
        const source = await environmentStore.getById(
          input.organizationId,
          input.copyShapesFromEnvironmentId,
        );
        assertCopySourceEnvironment(source, input.projectId);
      }

      const created = await environmentStore.create({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        displayName: input.displayName,
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.development,
      });

      const copiedShapeCount =
        input.copyShapesFromEnvironmentId === undefined
          ? 0
          : await copyEnvironmentSecretShapes(db, {
              organizationId: input.organizationId,
              projectId: input.projectId,
              sourceEnvironmentId: input.copyShapesFromEnvironmentId,
              targetEnvironmentId: input.environmentId,
            });

      return toEnvironmentMetadataRead(created, copiedShapeCount);
    },
  );
}

/**
 * Creates a non-protected development environment with a client-minted opaque ID.
 * Optionally copies Secret Shapes (variable keys only) from another environment in the same project.
 */
export async function createEnvironmentOperation({
  input,
  auditActor,
  accessActor,
}: CreateEnvironmentOperationInput): Promise<CreateEnvironmentRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);

  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: {
      organizationId: input.organizationId,
      projectId: input.projectId,
    },
    requiredScope: AUTHORIZATION_SCOPES.projectConfigure,
    requestId: input.requestId,
  });

  try {
    return await createEnvironmentInScope(input);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw resourceConflictError("environment id already exists in organization");
    }
    throw error;
  }
}
