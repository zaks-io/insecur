import { parseDisplayName } from "@insecur/domain";
import { type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  TenantSecretMatrixMetadataStore,
  toIsoTimestamp,
  withTenantScope,
} from "@insecur/tenant-store";
import type {
  EnvironmentSecretCurrentVersionRead,
  EnvironmentSecretRead,
  ListEnvironmentSecretsRpcInput,
  ListEnvironmentSecretsRpcPayload,
} from "@insecur/worker-kit";

import { authorizeEnvironmentSecretReadScopes } from "./authorize-environment-secret-read.js";

export interface ListEnvironmentSecretsOperationInput {
  readonly input: ListEnvironmentSecretsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function toCurrentVersionRead(row: {
  currentVersionId: NonNullable<
    Awaited<
      ReturnType<TenantSecretMatrixMetadataStore["listByEnvironment"]>
    >[number]["currentVersionId"]
  >;
  currentVersionNumber: number;
  currentLifecycleState: NonNullable<
    Awaited<
      ReturnType<TenantSecretMatrixMetadataStore["listByEnvironment"]>
    >[number]["currentLifecycleState"]
  >;
  currentVersionCreatedAt: Date;
  currentPublishedAt: Date | null;
  currentVersionDescriptiveVerdicts: NonNullable<
    Awaited<
      ReturnType<TenantSecretMatrixMetadataStore["listByEnvironment"]>
    >[number]["currentVersionDescriptiveVerdicts"]
  >;
}): EnvironmentSecretCurrentVersionRead {
  return {
    secretVersionId: row.currentVersionId,
    versionNumber: row.currentVersionNumber,
    lifecycleState: row.currentLifecycleState,
    createdAt: toIsoTimestamp(row.currentVersionCreatedAt),
    descriptiveVerdicts: row.currentVersionDescriptiveVerdicts,
    ...(row.currentPublishedAt !== null
      ? { publishedAt: toIsoTimestamp(row.currentPublishedAt) }
      : {}),
  };
}

function toEnvironmentSecretRead(
  row: Awaited<ReturnType<TenantSecretMatrixMetadataStore["listByEnvironment"]>>[number],
): EnvironmentSecretRead | null {
  const parsedDisplayName = parseDisplayName(row.variableKey);
  if (!parsedDisplayName.ok) {
    return null;
  }

  const currentVersion =
    row.currentVersionId !== null &&
    row.currentVersionNumber !== null &&
    row.currentLifecycleState !== null &&
    row.currentVersionCreatedAt !== null &&
    row.currentVersionDescriptiveVerdicts !== null
      ? toCurrentVersionRead({
          currentVersionId: row.currentVersionId,
          currentVersionNumber: row.currentVersionNumber,
          currentLifecycleState: row.currentLifecycleState,
          currentVersionCreatedAt: row.currentVersionCreatedAt,
          currentPublishedAt: row.currentPublishedAt,
          currentVersionDescriptiveVerdicts: row.currentVersionDescriptiveVerdicts,
        })
      : undefined;

  return {
    secretId: row.secretId,
    variableKey: row.variableKey,
    displayName: parsedDisplayName.value,
    ...(currentVersion !== undefined ? { currentVersion } : {}),
    createdAt: toIsoTimestamp(row.createdAt),
  };
}

/**
 * Authorize-then-read for environment-scoped Secret Shape metadata (INS-434). Requires org
 * membership plus `project:read`, `environment:read`, and `secret:read` at the project coordinate.
 * The payload is metadata-only and never includes secret values or ciphertext.
 */
export async function listEnvironmentSecretsOperation({
  input,
  auditActor,
  accessActor,
}: ListEnvironmentSecretsOperationInput): Promise<ListEnvironmentSecretsRpcPayload> {
  await authorizeEnvironmentSecretReadScopes({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  });

  const secretRows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      new TenantSecretMatrixMetadataStore(db).listByEnvironment({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      }),
  );

  const secrets = secretRows.flatMap((row) => {
    const mapped = toEnvironmentSecretRead(row);
    return mapped ? [mapped] : [];
  });

  return { secrets };
}
