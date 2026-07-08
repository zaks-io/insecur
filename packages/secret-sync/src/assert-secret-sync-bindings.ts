import {
  SECRET_SYNC_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  SECRET_VERSION_LIFECYCLE_STATES,
  TenantEnvironmentLifecycleStore,
  TenantSecretMatrixMetadataStore,
  resolveSecretForPolicyBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import { SecretSyncError } from "./secret-sync-error.js";

export interface AssertSecretSyncBindingsInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretIds: readonly SecretId[];
}

function mapSecretBindingError(error: unknown): never {
  if (error instanceof SecretVersionStoreNotFoundError) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.secretBindingNotFound,
      "secret sync binding secret not found in source environment",
    );
  }
  if (error instanceof SecretVersionStoreConflictError) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.secretBindingEnvironmentMismatch,
      "secret sync binding secret belongs to a different environment",
    );
  }
  throw error;
}

async function assertBindingSecretExists(
  organizationId: OrganizationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  boundSecretId: SecretId,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId }, async ({ db }) => {
    try {
      await resolveSecretForPolicyBinding(db, {
        organizationId,
        projectId,
        environmentId,
        secretId: boundSecretId,
      });
    } catch (error) {
      mapSecretBindingError(error);
    }
  });
}

function assertSecretVersionReady(
  environmentIsProtected: boolean,
  secret: {
    readonly currentLifecycleState: string | null;
    readonly currentVersionId: string | null;
  },
): void {
  if (environmentIsProtected) {
    if (secret.currentLifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.live) {
      throw new SecretSyncError(
        SECRET_SYNC_ERROR_CODES.sourceValueMissing,
        "protected secret sync binding requires a published version",
      );
    }
    return;
  }

  if (secret.currentVersionId === null) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.sourceValueMissing,
      "secret sync binding requires a current secret version",
    );
  }
}

async function assertPublishedOrCurrentVersionExists(
  input: AssertSecretSyncBindingsInput,
): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const environmentStore = new TenantEnvironmentLifecycleStore(db);
      const environment = await environmentStore.getById(input.organizationId, input.environmentId);
      if (!environment) {
        throw new SecretSyncError(
          SECRET_SYNC_ERROR_CODES.invalidBindings,
          "secret sync source environment not found",
        );
      }

      const metadataStore = new TenantSecretMatrixMetadataStore(db);
      const secrets = await metadataStore.listByEnvironment({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      });
      const secretById = new Map(secrets.map((row) => [row.secretId, row]));

      for (const boundSecretId of input.secretIds) {
        const secret = secretById.get(boundSecretId);
        if (!secret) {
          throw new SecretSyncError(
            SECRET_SYNC_ERROR_CODES.secretBindingNotFound,
            "secret sync binding secret not found in source environment",
          );
        }
        assertSecretVersionReady(environment.isProtected, secret);
      }
    },
  );
}

export async function assertSecretSyncBindings(
  input: AssertSecretSyncBindingsInput,
): Promise<void> {
  for (const boundSecretId of input.secretIds) {
    await assertBindingSecretExists(
      input.organizationId,
      input.projectId,
      input.environmentId,
      boundSecretId,
    );
  }
  await assertPublishedOrCurrentVersionExists(input);
}
