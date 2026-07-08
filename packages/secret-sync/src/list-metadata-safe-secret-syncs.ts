import type { OrganizationId, ProjectId } from "@insecur/domain";
import {
  TenantSecretSyncStore,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import {
  toMetadataSafeSecretSync,
  type MetadataSafeSecretSync,
} from "./metadata-safe-secret-sync.js";
import { loadSecretSyncSensitiveMetadata } from "./store-secret-sync-sensitive-metadata.js";

function groupBindingsBySync(
  bindings: readonly SecretSyncBindingRow[],
): Map<string, SecretSyncBindingRow[]> {
  const bindingsBySync = new Map<string, SecretSyncBindingRow[]>();
  for (const binding of bindings) {
    const existing = bindingsBySync.get(binding.secretSyncId) ?? [];
    existing.push(binding);
    bindingsBySync.set(binding.secretSyncId, existing);
  }
  return bindingsBySync;
}

async function toMetadataSafeSecretSyncRow(input: {
  readonly db: TenantScopedDb;
  readonly sync: SecretSyncRow;
  readonly syncBindings: readonly SecretSyncBindingRow[];
}): Promise<MetadataSafeSecretSync> {
  const sensitiveMetadata = await loadSecretSyncSensitiveMetadata({
    db: input.db,
    organizationId: input.sync.organizationId,
    projectId: input.sync.projectId,
    secretSyncId: input.sync.id,
    bindingIds: input.syncBindings.map((binding) => binding.id),
  });

  return toMetadataSafeSecretSync({
    sync: input.sync,
    bindings: input.syncBindings.map((binding) => ({
      id: binding.id,
      secretId: binding.secretId,
      hasProviderDestination: sensitiveMetadata.bindingDestinations.has(binding.id),
    })),
    hasWorkerScriptTarget: sensitiveMetadata.workerScriptName !== null,
  });
}

export async function listMetadataSafeSecretSyncs(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}): Promise<readonly MetadataSafeSecretSync[]> {
  const syncStore = new TenantSecretSyncStore(input.db);
  const rows = await syncStore.listSecretSyncs({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const activeRows = rows.filter((row) => row.status !== "deleted");
  const bindings = await syncStore.listBindingsForSyncs(
    input.organizationId,
    activeRows.map((row) => row.id),
  );
  const bindingsBySync = groupBindingsBySync(bindings);

  const payloads: MetadataSafeSecretSync[] = [];
  for (const sync of activeRows) {
    payloads.push(
      await toMetadataSafeSecretSyncRow({
        db: input.db,
        sync,
        syncBindings: bindingsBySync.get(sync.id) ?? [],
      }),
    );
  }
  return payloads;
}
