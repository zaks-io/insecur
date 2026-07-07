import { SECRET_ERROR_CODES } from "@insecur/domain";
import { type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { SecretWriteError } from "@insecur/secret-store";
import {
  resolveSecretForRead,
  SecretVersionStoreNotFoundError,
  TenantSecretMatrixMetadataStore,
  toIsoTimestamp,
  withTenantScope,
} from "@insecur/tenant-store";
import type {
  ListSecretVersionsRpcInput,
  ListSecretVersionsRpcPayload,
  SecretVersionMetadataRead,
} from "@insecur/worker-kit";

import { authorizeEnvironmentSecretReadScopes } from "./authorize-environment-secret-read.js";

export interface ListSecretVersionsOperationInput {
  readonly input: ListSecretVersionsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function toVersionMetadataRead(row: {
  secretVersionId: SecretVersionMetadataRead["secretVersionId"];
  versionNumber: number;
  lifecycleState: SecretVersionMetadataRead["lifecycleState"];
  createdAt: Date;
  publishedAt: Date | null;
  isCurrent: boolean;
  isPublished: boolean;
}): SecretVersionMetadataRead {
  return {
    secretVersionId: row.secretVersionId,
    versionNumber: row.versionNumber,
    lifecycleState: row.lifecycleState,
    createdAt: toIsoTimestamp(row.createdAt),
    ...(row.publishedAt !== null ? { publishedAt: toIsoTimestamp(row.publishedAt) } : {}),
    isCurrent: row.isCurrent,
    isPublished: row.isPublished,
  };
}

/**
 * Authorize-then-read for one Secret's version metadata in an Environment (INS-434). Requires org
 * membership plus `project:read`, `environment:read`, and `secret:read` at the project coordinate.
 * The payload is metadata-only and never includes secret values or ciphertext.
 */
export async function listSecretVersionsOperation({
  input,
  auditActor,
  accessActor,
}: ListSecretVersionsOperationInput): Promise<ListSecretVersionsRpcPayload> {
  await authorizeEnvironmentSecretReadScopes({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  });

  try {
    const { resolved, versions } = await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ db }) => {
        const resolvedSecret = await resolveSecretForRead(db, {
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          secretId: input.secretId,
        });

        const versionRows = await new TenantSecretMatrixMetadataStore(db).listVersionMetadata({
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          secretId: resolvedSecret.secretId,
        });

        return { resolved: resolvedSecret, versions: versionRows };
      },
    );

    return {
      secretId: resolved.secretId,
      variableKey: resolved.variableKey,
      versions: versions.map((row) => toVersionMetadataRead(row)),
    };
  } catch (error) {
    if (error instanceof SecretVersionStoreNotFoundError) {
      throw new SecretWriteError(SECRET_ERROR_CODES.coordinateInvalid, "secret not found");
    }
    throw error;
  }
}
