import { AUTH_ERROR_CODES, type VariableKey } from "@insecur/domain";
import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  type ActorRef,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  TenantEnvironmentLifecycleStore,
  TenantSecretMatrixMetadataStore,
  toIsoTimestamp,
  withTenantScope,
  type SecretMatrixSecretRow,
} from "@insecur/tenant-store";
import type {
  EnvironmentMetadataRead,
  ListProjectSecretsRpcInput,
  ListProjectSecretsRpcPayload,
  SecretMatrixCellRead,
  SecretMatrixLastSetActorRead,
  SecretMatrixRowRead,
} from "@insecur/worker-kit";

import { toPrincipalChainActorRead } from "./principal-chain-actor-read.js";

export interface ListProjectSecretsOperationInput {
  readonly input: ListProjectSecretsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

function toEnvironmentMetadataRead(row: {
  environmentId: EnvironmentMetadataRead["environmentId"];
  organizationId: EnvironmentMetadataRead["organizationId"];
  projectId: EnvironmentMetadataRead["projectId"];
  displayName: EnvironmentMetadataRead["displayName"];
  lifecycleStage: EnvironmentMetadataRead["lifecycleStage"];
  isProtected: boolean;
  createdAt: Date;
}): EnvironmentMetadataRead {
  return {
    environmentId: row.environmentId,
    organizationId: row.organizationId,
    projectId: row.projectId,
    displayName: row.displayName,
    lifecycleStage: row.lifecycleStage,
    isProtected: row.isProtected,
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

function toLastSetActorRead(
  actor: NonNullable<SecretMatrixSecretRow["lastSetActor"]>,
): SecretMatrixLastSetActorRead | undefined {
  return toPrincipalChainActorRead(actor);
}

function toPresentCell(row: SecretMatrixSecretRow): SecretMatrixCellRead {
  const lastSetActor = row.lastSetActor ? toLastSetActorRead(row.lastSetActor) : undefined;
  return {
    environmentId: row.environmentId,
    present: true,
    secretId: row.secretId,
    versionNumber: row.versionNumber,
    secretVersionId: row.secretVersionId,
    lifecycleState: row.lifecycleState,
    lastSetAt: toIsoTimestamp(row.lastSetAt),
    ...(lastSetActor !== undefined ? { lastSetActor } : {}),
  };
}

function absentCell(environmentId: SecretMatrixCellRead["environmentId"]): SecretMatrixCellRead {
  return {
    environmentId,
    present: false,
  };
}

function buildMatrixRows(
  environments: readonly EnvironmentMetadataRead[],
  secretRows: readonly SecretMatrixSecretRow[],
): readonly SecretMatrixRowRead[] {
  const secretsByVariableKey = new Map<VariableKey, Map<string, SecretMatrixSecretRow>>();
  for (const row of secretRows) {
    const byEnvironment =
      secretsByVariableKey.get(row.variableKey) ?? new Map<string, SecretMatrixSecretRow>();
    byEnvironment.set(row.environmentId, row);
    secretsByVariableKey.set(row.variableKey, byEnvironment);
  }

  const variableKeys = [...secretsByVariableKey.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  return variableKeys.map((variableKey) => {
    const byEnvironment =
      secretsByVariableKey.get(variableKey) ?? new Map<string, SecretMatrixSecretRow>();
    const cells = environments.map((environment) => {
      const secretRow = byEnvironment.get(environment.environmentId);
      return secretRow ? toPresentCell(secretRow) : absentCell(environment.environmentId);
    });
    return { variableKey, cells };
  });
}

/**
 * Authorize-then-read for the project secrets matrix metadata (INS-363). Requires org membership
 * plus `project:read`, `environment:read`, and `secret:read` at the project coordinate. The payload
 * is metadata-only and never includes secret values or ciphertext.
 */
export async function listProjectSecretsOperation({
  input,
  auditActor,
  accessActor,
}: ListProjectSecretsOperationInput): Promise<ListProjectSecretsRpcPayload> {
  if (accessActor.type !== "user") {
    throw insufficientScopeError();
  }

  await assertOrganizationMembership(accessActor, input.organizationId);

  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  for (const requiredScope of [
    AUTHORIZATION_SCOPES.projectRead,
    AUTHORIZATION_SCOPES.environmentRead,
    AUTHORIZATION_SCOPES.secretRead,
  ]) {
    await authorizeScopeOrThrow({
      actor: accessActor,
      auditActor,
      coordinate,
      requiredScope,
      requestId: input.requestId,
    });
  }

  const { environmentRows, secretRows } = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const environmentStore = new TenantEnvironmentLifecycleStore(db);
      const secretStore = new TenantSecretMatrixMetadataStore(db);
      const [environments, secrets] = await Promise.all([
        environmentStore.listByProject(input.organizationId, input.projectId),
        secretStore.listByProject({
          organizationId: input.organizationId,
          projectId: input.projectId,
        }),
      ]);
      return { environmentRows: environments, secretRows: secrets };
    },
  );

  const environments = environmentRows.map((row) => toEnvironmentMetadataRead(row));
  return {
    environments,
    rows: buildMatrixRows(environments, secretRows),
  };
}
