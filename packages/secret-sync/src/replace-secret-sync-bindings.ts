import type { Keyring } from "@insecur/crypto";
import { secretSyncBindingId, type OrganizationId, type ProjectId } from "@insecur/domain";
import {
  TenantSecretSyncStore,
  TenantSensitiveMetadataStore,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { storeSecretSyncBindingDestinations } from "./store-secret-sync-sensitive-metadata.js";
import type { ValidatedSecretSyncBindingInput } from "./validate-secret-sync-bindings.js";

export async function replaceSecretSyncBindings(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly secretSyncId: SecretSyncRow["id"];
  readonly validatedBindings: readonly ValidatedSecretSyncBindingInput[];
  readonly keyring: Keyring;
}): Promise<readonly SecretSyncBindingRow[]> {
  const syncStore = new TenantSecretSyncStore(input.db);
  const sensitiveMetadataStore = new TenantSensitiveMetadataStore(input.db);
  const bindingRows = input.validatedBindings.map((binding) => ({
    bindingId: secretSyncBindingId.generate(),
    secretId: binding.secretId,
    providerDestination: binding.providerDestination,
  }));

  const persistedBindings = await syncStore.replaceBindings({
    organizationId: input.organizationId,
    secretSyncId: input.secretSyncId,
    bindings: bindingRows.map((binding) => ({
      organizationId: input.organizationId,
      secretSyncId: input.secretSyncId,
      bindingId: binding.bindingId,
      secretId: binding.secretId,
    })),
  });

  await storeSecretSyncBindingDestinations({
    organizationId: input.organizationId,
    projectId: input.projectId,
    secretSyncId: input.secretSyncId,
    bindings: bindingRows.map((binding) => ({
      bindingId: binding.bindingId,
      providerDestination: binding.providerDestination,
    })),
    keyring: input.keyring,
    sensitiveMetadataStore,
  });

  return persistedBindings;
}
