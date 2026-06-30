import {
  DEFAULT_ROOT_KEY_VERSION,
  RootKeyNotConfiguredError,
  SecretsStoreRootKeyProvider,
  type KeyVersion,
  type Keyring,
  type RootKeyProvider,
  type SecretsStoreSecretBinding,
} from "@insecur/crypto";
import { createTenantBackedKeyring } from "@insecur/tenant-keyring";

import type { RuntimeEnv } from "../env.js";

function bindingForRootKeyVersion(
  env: RuntimeEnv,
  version: KeyVersion,
): SecretsStoreSecretBinding | undefined {
  switch (version) {
    case 1:
      return env.INSTANCE_ROOT_KEY_V1;
    default:
      return undefined;
  }
}

/** Dispatches unwrap to the per-version Secrets Store binding recorded on data-key rows. */
class RuntimeEnvRootKeyProvider implements RootKeyProvider {
  constructor(private readonly env: RuntimeEnv) {}

  async getRootKeyBytes(version: KeyVersion): Promise<Uint8Array> {
    const binding = bindingForRootKeyVersion(this.env, version);
    if (!binding) {
      throw new RootKeyNotConfiguredError();
    }
    return new SecretsStoreRootKeyProvider(binding, version).getRootKeyBytes(version);
  }
}

/** Builds an ADR-0064 request-scoped keyring from Runtime bindings; does not cache material. */
export function createKeyringFromRuntimeEnv(env: RuntimeEnv): Keyring {
  if (!bindingForRootKeyVersion(env, DEFAULT_ROOT_KEY_VERSION)) {
    throw new RootKeyNotConfiguredError();
  }
  return createTenantBackedKeyring(new RuntimeEnvRootKeyProvider(env));
}
