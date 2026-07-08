import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  SECRET_SYNC_ERROR_CODES,
  type AppConnectionId,
  type DisplayName,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretSyncId,
} from "@insecur/domain";
import type { SecretSyncKind, SecretSyncMappingBehavior } from "@insecur/domain";
import {
  TenantAppConnectionStore,
  TenantSecretSyncStore,
  TenantSensitiveMetadataStore,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { assertSecretSyncConnection } from "./assert-secret-sync-connection.js";
import { mapSecretSyncStoreError } from "./map-secret-sync-store-error.js";
import {
  toMetadataSafeSecretSync,
  type MetadataSafeSecretSync,
} from "./metadata-safe-secret-sync.js";
import { replaceSecretSyncBindings } from "./replace-secret-sync-bindings.js";
import { SecretSyncError } from "./secret-sync-error.js";
import {
  loadSecretSyncSensitiveMetadata,
  storeSecretSyncWorkerScriptTarget,
} from "./store-secret-sync-sensitive-metadata.js";
import type { ValidatedSecretSyncBindingInput } from "./validate-secret-sync-bindings.js";
import type { validateGitHubActionsTarget } from "./validate-secret-sync-target.js";

export interface PersistNewSecretSyncInput {
  readonly db: TenantScopedDb;
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly secretSyncId: SecretSyncId;
  readonly displayName: DisplayName;
  readonly kind: SecretSyncKind;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly validatedBindings: readonly ValidatedSecretSyncBindingInput[];
  readonly validatedTarget: ReturnType<typeof validateGitHubActionsTarget>;
  readonly keyring: Keyring;
}

export interface PersistNewSecretSyncResult {
  readonly sync: SecretSyncRow;
  readonly persistedBindings: readonly SecretSyncBindingRow[];
  readonly secretSync: MetadataSafeSecretSync;
}

async function createSecretSyncRow(input: PersistNewSecretSyncInput): Promise<SecretSyncRow> {
  const connectionStore = new TenantAppConnectionStore(input.db);
  const connection = await connectionStore.getConnectionById(
    input.organizationId,
    input.appConnectionId,
  );
  if (!connection) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "secret sync app connection not found",
    );
  }
  assertSecretSyncConnection({ kind: input.kind, connection });

  const syncStore = new TenantSecretSyncStore(input.db);
  try {
    return await syncStore.createSecretSync({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      appConnectionId: input.appConnectionId,
      secretSyncId: input.secretSyncId,
      displayName: input.displayName,
      kind: input.kind,
      ...(input.mappingBehavior !== undefined ? { mappingBehavior: input.mappingBehavior } : {}),
      ...(input.autoSyncEnabled !== undefined ? { autoSyncEnabled: input.autoSyncEnabled } : {}),
      githubProviderScope: input.validatedTarget.githubProviderScope,
      targetRepoId: input.validatedTarget.targetRepoId,
      targetGithubEnvironmentId: input.validatedTarget.targetGithubEnvironmentId,
      createdByUserId: input.actor.userId,
    });
  } catch (error) {
    mapSecretSyncStoreError(error);
  }
}

async function storeWorkerScriptTargetIfNeeded(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly secretSyncId: SecretSyncId;
  readonly workerScriptName: string | null;
  readonly keyring: Keyring;
}): Promise<void> {
  if (input.workerScriptName === null) {
    return;
  }
  const sensitiveMetadataStore = new TenantSensitiveMetadataStore(input.db);
  await storeSecretSyncWorkerScriptTarget({
    organizationId: input.organizationId,
    projectId: input.projectId,
    secretSyncId: input.secretSyncId,
    workerScriptName: input.workerScriptName,
    keyring: input.keyring,
    sensitiveMetadataStore,
  });
}

export async function persistNewSecretSync(
  input: PersistNewSecretSyncInput,
): Promise<PersistNewSecretSyncResult> {
  const sync = await createSecretSyncRow(input);
  const persistedBindings = await replaceSecretSyncBindings({
    db: input.db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    secretSyncId: sync.id,
    validatedBindings: input.validatedBindings,
    keyring: input.keyring,
  });

  await storeWorkerScriptTargetIfNeeded({
    db: input.db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    secretSyncId: sync.id,
    workerScriptName: input.validatedTarget.workerScriptName,
    keyring: input.keyring,
  });

  const sensitiveMetadata = await loadSecretSyncSensitiveMetadata({
    db: input.db,
    organizationId: sync.organizationId,
    projectId: sync.projectId,
    secretSyncId: sync.id,
    bindingIds: persistedBindings.map((binding) => binding.id),
  });

  return {
    sync,
    persistedBindings,
    secretSync: toMetadataSafeSecretSync({
      sync,
      bindings: persistedBindings.map((binding) => ({
        id: binding.id,
        secretId: binding.secretId,
        hasProviderDestination: sensitiveMetadata.bindingDestinations.has(binding.id),
      })),
      hasWorkerScriptTarget: sensitiveMetadata.workerScriptName !== null,
    }),
  };
}
