import {
  RootKeyNotConfiguredError,
  SecretsStoreRootKeyProvider,
  type Keyring,
} from "@insecur/crypto";
import { createTenantBackedKeyring } from "@insecur/tenant-store";

import type { WorkerEnv } from "../env.js";

/** Builds a request-scoped keyring from Worker bindings; does not cache binding material. */
export function createKeyringFromWorkerEnv(env: WorkerEnv): Keyring {
  if (!env.INSTANCE_ROOT_KEY) {
    throw new RootKeyNotConfiguredError();
  }
  return createTenantBackedKeyring(new SecretsStoreRootKeyProvider(env.INSTANCE_ROOT_KEY));
}
