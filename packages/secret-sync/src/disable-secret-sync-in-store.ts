import { SECRET_SYNC_ERROR_CODES, type OrganizationId } from "@insecur/domain";
import {
  TenantSecretSyncStore,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { mapSecretSyncStoreError } from "./map-secret-sync-store-error.js";
import { toMetadataSafeSecretSyncView } from "./secret-sync-command-shared.js";
import { SecretSyncError } from "./secret-sync-error.js";

export async function disableSecretSyncInStore(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly existing: SecretSyncRow;
}) {
  if (input.existing.status === "disabled") {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.disabled, "secret sync is already disabled");
  }

  const syncStore = new TenantSecretSyncStore(input.db);
  let sync;
  try {
    sync = await syncStore.updateSecretSync({
      organizationId: input.organizationId,
      secretSyncId: input.existing.id,
      status: "disabled",
      disabledAt: new Date(),
    });
  } catch (error) {
    mapSecretSyncStoreError(error);
  }

  const bindings = await syncStore.listBindings(input.organizationId, sync.id);
  return {
    sync,
    secretSync: await toMetadataSafeSecretSyncView({ db: input.db, sync, bindings }),
  };
}
