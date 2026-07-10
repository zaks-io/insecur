import { assertAppConnectionSyncEligible } from "@insecur/app-connection";
import { SECRET_SYNC_ERROR_CODES, SECRET_SYNC_KINDS, type SecretSyncId } from "@insecur/domain";
import {
  TenantAppConnectionStore,
  TenantSecretSyncStore,
  type AppConnectionRow,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { SecretSyncError } from "./secret-sync-error.js";
import { loadSecretSyncSensitiveMetadata } from "./store-secret-sync-sensitive-metadata.js";

function assertSyncStatusExecutable(sync: SecretSyncRow): void {
  if (sync.status === "disabled") {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.disabled, "secret sync is disabled");
  }
  if (sync.status === "deleted") {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, "secret sync is deleted");
  }
}

async function loadEligibleConnection(
  db: TenantScopedDb,
  organizationId: SecretSyncRow["organizationId"],
  appConnectionId: SecretSyncRow["appConnectionId"],
) {
  const connectionStore = new TenantAppConnectionStore(db);
  const connection = await connectionStore.getConnectionById(organizationId, appConnectionId);
  if (!connection) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "secret sync app connection not found",
    );
  }

  try {
    assertAppConnectionSyncEligible({ connection });
  } catch {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.connectionNotEligible,
      "secret sync app connection is not eligible",
    );
  }

  return connection;
}

function assertBindingDestinationsPresent(input: {
  readonly sync: SecretSyncRow;
  readonly bindings: readonly SecretSyncBindingRow[];
  readonly bindingDestinations: ReadonlyMap<SecretSyncBindingRow["id"], string>;
  readonly workerScriptName: string | null;
}): void {
  if (input.sync.kind === SECRET_SYNC_KINDS.cloudflareWorkerSecret) {
    if (input.workerScriptName === null) {
      throw new SecretSyncError(
        SECRET_SYNC_ERROR_CODES.invalidDestination,
        "cloudflare worker secret sync target is invalid",
      );
    }
  }

  if (input.bindings.length === 0) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidBindings,
      "secret sync has no bindings",
    );
  }

  for (const binding of input.bindings) {
    if (!input.bindingDestinations.has(binding.id)) {
      throw new SecretSyncError(
        SECRET_SYNC_ERROR_CODES.invalidDestination,
        "secret sync binding destination is invalid",
      );
    }
  }
}

export async function loadExecutableSecretSyncContext(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: SecretSyncRow["organizationId"];
  readonly secretSyncId: SecretSyncId;
}): Promise<{
  readonly sync: SecretSyncRow;
  readonly connection: AppConnectionRow;
  readonly bindings: readonly SecretSyncBindingRow[];
}> {
  const syncStore = new TenantSecretSyncStore(input.db);
  const sync = await syncStore.getSecretSyncById(input.organizationId, input.secretSyncId);
  if (!sync) {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, "secret sync not found");
  }
  assertSyncStatusExecutable(sync);

  const connection = await loadEligibleConnection(
    input.db,
    sync.organizationId,
    sync.appConnectionId,
  );

  const bindings = await syncStore.listBindings(input.organizationId, sync.id);
  const sensitiveMetadata = await loadSecretSyncSensitiveMetadata({
    db: input.db,
    organizationId: sync.organizationId,
    projectId: sync.projectId,
    secretSyncId: sync.id,
    bindingIds: bindings.map((binding) => binding.id),
  });

  assertBindingDestinationsPresent({
    sync,
    bindings,
    bindingDestinations: sensitiveMetadata.bindingDestinations,
    workerScriptName: sensitiveMetadata.workerScriptName,
  });

  return { sync, connection, bindings };
}
