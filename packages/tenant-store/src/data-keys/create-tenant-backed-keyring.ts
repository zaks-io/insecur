import {
  Keyring,
  PersistingMetadataTenantDataKeySource,
  type RootKeyProvider,
} from "@insecur/crypto";

import {
  createTenantDataKeyMetadataAccess,
  TenantScopedDataKeyMetadataAccess,
} from "./tenant-scoped-data-key-metadata.js";

/** Production keyring that unwraps wrapped DEKs from tenant-scoped Postgres metadata. */
export function createTenantBackedKeyring(rootKeyProvider: RootKeyProvider): Keyring {
  const metadata = createTenantDataKeyMetadataAccess();
  return createTenantBackedKeyringFromAccess(rootKeyProvider, metadata);
}

export function createTenantBackedKeyringFromAccess(
  rootKeyProvider: RootKeyProvider,
  metadata: TenantScopedDataKeyMetadataAccess,
): Keyring {
  const source = new PersistingMetadataTenantDataKeySource(rootKeyProvider, metadata, metadata);
  return new Keyring(rootKeyProvider, source);
}
