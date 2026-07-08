import {
  listProjectMachineIdentityRows,
  toIsoTimestamp,
  withTenantScope,
  type EnvironmentDeployKeyAuthMethodRow,
  type GitHubActionsOidcAuthMethodRow,
  type ProjectMachineIdentityRow,
} from "@insecur/tenant-store";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type {
  EnvironmentDeployKeyAuthMethodRead,
  GitHubActionsOidcAuthMethodRead,
  ListProjectMachineIdentitiesRpcInput,
  ListProjectMachineIdentitiesRpcPayload,
  ProjectMachineIdentityRead,
} from "@insecur/worker-kit";

import { authorizeProjectReadScope } from "./authorize-environment-secret-read.js";

export interface ListProjectMachineIdentitiesOperationInput {
  readonly input: ListProjectMachineIdentitiesRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function toGitHubActionsOidcRead(
  row: GitHubActionsOidcAuthMethodRow,
): GitHubActionsOidcAuthMethodRead {
  return {
    authMethodId: row.authMethodId,
    environmentId: row.environmentId,
    githubRepository: row.githubRepository,
    githubEnvironment: row.githubEnvironment,
    status: row.status,
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

function toEnvironmentDeployKeyRead(
  row: EnvironmentDeployKeyAuthMethodRow,
): EnvironmentDeployKeyAuthMethodRead {
  return {
    authMethodId: row.authMethodId,
    environmentId: row.environmentId,
    status: row.status,
    nonExpiring: row.nonExpiring,
    expiresAt: row.expiresAt === null ? null : toIsoTimestamp(row.expiresAt),
    rotationIntervalSeconds: row.rotationIntervalSeconds,
    rotationReminderIntervalSeconds: row.rotationReminderIntervalSeconds,
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

function toMachineIdentityRead(row: ProjectMachineIdentityRow): ProjectMachineIdentityRead {
  return {
    machineIdentityId: row.machineIdentityId,
    organizationId: row.organizationId,
    displayName: row.displayName,
    status: row.status,
    createdAt: toIsoTimestamp(row.createdAt),
    githubActionsOidcMethods: row.githubActionsOidcMethods.map(toGitHubActionsOidcRead),
    environmentDeployKeyMethods: row.environmentDeployKeyMethods.map(toEnvironmentDeployKeyRead),
  };
}

/**
 * Authorize-then-read for project machine identities (INS-382). Requires `project:read` at the
 * project coordinate. Auth method rows are metadata-only and never include credential material.
 */
export async function listProjectMachineIdentitiesOperation({
  input,
  auditActor,
  accessActor,
}: ListProjectMachineIdentitiesOperationInput): Promise<ListProjectMachineIdentitiesRpcPayload> {
  await authorizeProjectReadScope({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  });

  const rows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      listProjectMachineIdentityRows(db, {
        organizationId: input.organizationId,
        projectId: input.projectId,
      }),
  );

  return {
    machineIdentities: rows.map((row) => toMachineIdentityRead(row)),
  };
}
