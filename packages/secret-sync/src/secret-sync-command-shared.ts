import type { UserActorRef } from "@insecur/access";
import type { RequestId, UserId } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId, SecretSyncId } from "@insecur/domain";
import {
  TenantSecretSyncStore,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
  withTenantScope,
} from "@insecur/tenant-store";

import { resolveSecretSyncManageAccess } from "./assert-secret-sync-access.js";
import { SecretSyncError } from "./secret-sync-error.js";
import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import { loadSecretSyncSensitiveMetadata } from "./store-secret-sync-sensitive-metadata.js";
import {
  toMetadataSafeSecretSync,
  type MetadataSafeSecretSync,
} from "./metadata-safe-secret-sync.js";

export interface SecretSyncCommandAuditScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly request: { readonly requestId: RequestId };
}

export function buildSecretSyncCommandAuditScope(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
}): SecretSyncCommandAuditScope {
  return {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    request: { requestId: input.requestId },
  };
}

async function runSecretSyncManageCommand<T>(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly run: (db: TenantScopedDb) => Promise<T>;
}): Promise<T> {
  await resolveSecretSyncManageAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => input.run(db),
  );
}

export async function runScopedSecretSyncMutation<T>(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly run: (context: {
    readonly db: TenantScopedDb;
    readonly syncStore: TenantSecretSyncStore;
    readonly existing: SecretSyncRow;
  }) => Promise<T>;
}): Promise<T> {
  return runSecretSyncManageCommand({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    run: async (db) =>
      withScopedSecretSyncStore({
        db,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        secretSyncId: input.secretSyncId,
        run: async ({ syncStore, existing }) => input.run({ db, syncStore, existing }),
      }),
  });
}

async function withScopedSecretSyncStore<T>(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly run: (context: {
    readonly syncStore: TenantSecretSyncStore;
    readonly existing: SecretSyncRow;
  }) => Promise<T>;
}): Promise<T> {
  const syncStore = new TenantSecretSyncStore(input.db);
  const existing = await getScopedSecretSyncOrThrow({
    db: input.db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretSyncId: input.secretSyncId,
  });
  return input.run({ syncStore, existing });
}

async function getScopedSecretSyncOrThrow(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
}): Promise<SecretSyncRow> {
  const syncStore = new TenantSecretSyncStore(input.db);
  const existing = await syncStore.getSecretSyncById(input.organizationId, input.secretSyncId);
  if (!existing || existing.status === "deleted") {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, "secret sync not found");
  }
  if (existing.projectId !== input.projectId || existing.environmentId !== input.environmentId) {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, "secret sync not found");
  }
  return existing;
}

export async function toMetadataSafeSecretSyncView(input: {
  readonly db: TenantScopedDb;
  readonly sync: SecretSyncRow;
  readonly bindings: readonly SecretSyncBindingRow[];
}): Promise<MetadataSafeSecretSync> {
  const sensitiveMetadata = await loadSecretSyncSensitiveMetadata({
    db: input.db,
    organizationId: input.sync.organizationId,
    projectId: input.sync.projectId,
    secretSyncId: input.sync.id,
    bindingIds: input.bindings.map((binding) => binding.id),
  });

  return toMetadataSafeSecretSync({
    sync: input.sync,
    bindings: input.bindings.map((binding) => ({
      id: binding.id,
      secretId: binding.secretId,
      hasProviderDestination: sensitiveMetadata.bindingDestinations.has(binding.id),
    })),
    hasWorkerScriptTarget: sensitiveMetadata.workerScriptName !== null,
  });
}
