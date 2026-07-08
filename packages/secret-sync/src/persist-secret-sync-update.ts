import type { Keyring } from "@insecur/crypto";
import {
  SECRET_SYNC_ERROR_CODES,
  type DisplayName,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { SecretSyncMappingBehavior } from "@insecur/domain";
import {
  TenantAppConnectionStore,
  TenantSecretSyncStore,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { assertSecretSyncBindings } from "./assert-secret-sync-bindings.js";
import { assertSecretSyncConnection } from "./assert-secret-sync-connection.js";
import { applySecretSyncTargetPatch } from "./apply-secret-sync-target-patch.js";
import { mapSecretSyncStoreError } from "./map-secret-sync-store-error.js";
import type { MetadataSafeSecretSync } from "./metadata-safe-secret-sync.js";
import { replaceSecretSyncBindings } from "./replace-secret-sync-bindings.js";
import { toBindingAuditDetails } from "./record-secret-sync-audit.js";
import { SecretSyncError } from "./secret-sync-error.js";
import { toMetadataSafeSecretSyncView } from "./secret-sync-command-shared.js";
import type { GitHubActionsTargetInput } from "./validate-secret-sync-target.js";
import {
  validateSecretSyncBindings,
  type SecretSyncBindingInput,
} from "./validate-secret-sync-bindings.js";

export interface PersistSecretSyncUpdateInput {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: SecretSyncRow["environmentId"];
  readonly existing: SecretSyncRow;
  readonly displayName?: DisplayName;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly bindings?: readonly SecretSyncBindingInput[];
  readonly githubTarget?: GitHubActionsTargetInput;
  readonly cloudflareTarget?: { readonly workerScriptName: string };
  readonly keyring: Keyring;
}

export interface PersistSecretSyncUpdateResult {
  readonly sync: SecretSyncRow;
  readonly persistedBindings: readonly SecretSyncBindingRow[];
  readonly bindingAuditDetails?: ReturnType<typeof toBindingAuditDetails>;
  readonly secretSync: MetadataSafeSecretSync;
}

async function replaceBindingsIfNeeded(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly existing: SecretSyncRow;
  readonly bindings: readonly SecretSyncBindingInput[];
  readonly keyring: Keyring;
}): Promise<{
  readonly persistedBindings: readonly SecretSyncBindingRow[];
  readonly bindingAuditDetails: ReturnType<typeof toBindingAuditDetails>;
}> {
  const validatedBindings = validateSecretSyncBindings(input.bindings);
  await assertSecretSyncBindings({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.existing.environmentId,
    secretIds: validatedBindings.map((binding) => binding.secretId),
  });

  const persistedBindings = await replaceSecretSyncBindings({
    db: input.db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    secretSyncId: input.existing.id,
    validatedBindings,
    keyring: input.keyring,
  });

  return {
    persistedBindings,
    bindingAuditDetails: toBindingAuditDetails({ bindings: persistedBindings }),
  };
}

async function assertPersistableSecretSyncConnection(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly existing: SecretSyncRow;
}): Promise<void> {
  const connectionStore = new TenantAppConnectionStore(input.db);
  const connection = await connectionStore.getConnectionById(
    input.organizationId,
    input.existing.appConnectionId,
  );
  if (!connection) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "secret sync app connection not found",
    );
  }
  assertSecretSyncConnection({ kind: input.existing.kind, connection });
}

async function updateSecretSyncRow(input: {
  readonly syncStore: TenantSecretSyncStore;
  readonly organizationId: OrganizationId;
  readonly existing: SecretSyncRow;
  readonly displayName?: DisplayName;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly targetPatch: Awaited<ReturnType<typeof applySecretSyncTargetPatch>>;
}): Promise<SecretSyncRow> {
  try {
    return await input.syncStore.updateSecretSync({
      organizationId: input.organizationId,
      secretSyncId: input.existing.id,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.mappingBehavior !== undefined ? { mappingBehavior: input.mappingBehavior } : {}),
      ...(input.autoSyncEnabled !== undefined ? { autoSyncEnabled: input.autoSyncEnabled } : {}),
      ...input.targetPatch,
    });
  } catch (error) {
    mapSecretSyncStoreError(error);
  }
}

async function resolvePersistedBindings(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly existing: SecretSyncRow;
  readonly bindings?: readonly SecretSyncBindingInput[];
  readonly keyring: Keyring;
}): Promise<{
  readonly persistedBindings: readonly SecretSyncBindingRow[];
  readonly bindingAuditDetails?: ReturnType<typeof toBindingAuditDetails>;
}> {
  const syncStore = new TenantSecretSyncStore(input.db);
  if (input.bindings === undefined) {
    return {
      persistedBindings: await syncStore.listBindings(input.organizationId, input.existing.id),
    };
  }

  const replaced = await replaceBindingsIfNeeded({
    db: input.db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    existing: input.existing,
    bindings: input.bindings,
    keyring: input.keyring,
  });
  return replaced;
}

export async function persistSecretSyncUpdate(
  input: PersistSecretSyncUpdateInput,
): Promise<PersistSecretSyncUpdateResult> {
  await assertPersistableSecretSyncConnection({
    db: input.db,
    organizationId: input.organizationId,
    existing: input.existing,
  });

  const { persistedBindings, bindingAuditDetails } = await resolvePersistedBindings(input);
  const targetPatch = await applySecretSyncTargetPatch({
    db: input.db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    existing: input.existing,
    ...(input.githubTarget !== undefined ? { githubTarget: input.githubTarget } : {}),
    ...(input.cloudflareTarget !== undefined ? { cloudflareTarget: input.cloudflareTarget } : {}),
    keyring: input.keyring,
  });
  const syncStore = new TenantSecretSyncStore(input.db);
  const sync = await updateSecretSyncRow({
    syncStore,
    organizationId: input.organizationId,
    existing: input.existing,
    targetPatch,
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.mappingBehavior !== undefined ? { mappingBehavior: input.mappingBehavior } : {}),
    ...(input.autoSyncEnabled !== undefined ? { autoSyncEnabled: input.autoSyncEnabled } : {}),
  });

  const result: PersistSecretSyncUpdateResult = {
    sync,
    persistedBindings,
    secretSync: await toMetadataSafeSecretSyncView({
      db: input.db,
      sync,
      bindings: persistedBindings,
    }),
  };
  if (bindingAuditDetails !== undefined) {
    return { ...result, bindingAuditDetails };
  }
  return result;
}
