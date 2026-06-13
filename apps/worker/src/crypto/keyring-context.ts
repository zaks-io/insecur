import {
  RootKeyNotConfiguredError,
  SecretsStoreRootKeyProvider,
  type KeyVersion,
  type Keyring,
  type RootKeyProvider,
  type SecretsStoreSecretBinding,
} from "@insecur/crypto";
import { createTenantBackedKeyring } from "@insecur/tenant-store";

import type { WorkerEnv } from "../env.js";

/** Wrap version for steady-state bootstrap; must match `DEFAULT_ROOT_KEY_VERSION` in @insecur/crypto. */
const CURRENT_WRAP_ROOT_KEY_VERSION = 1 satisfies KeyVersion;

function bindingForRootKeyVersion(
  env: WorkerEnv,
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
class WorkerEnvRootKeyProvider implements RootKeyProvider {
  constructor(private readonly env: WorkerEnv) {}

  async getRootKeyBytes(version: KeyVersion): Promise<Uint8Array> {
    const binding = bindingForRootKeyVersion(this.env, version);
    if (!binding) {
      throw new RootKeyNotConfiguredError();
    }
    return new SecretsStoreRootKeyProvider(binding, version).getRootKeyBytes(version);
  }
}

/** Builds a request-scoped keyring from Worker bindings; does not cache binding material. */
export function createKeyringFromWorkerEnv(env: WorkerEnv): Keyring {
  if (!bindingForRootKeyVersion(env, CURRENT_WRAP_ROOT_KEY_VERSION)) {
    throw new RootKeyNotConfiguredError();
  }
  return createTenantBackedKeyring(new WorkerEnvRootKeyProvider(env));
}
