import { createKeyringFromSecretsStoreBinding, type Keyring } from "@insecur/crypto";

import type { WorkerEnv } from "../env.js";

/** Builds a request-scoped keyring from Worker bindings; does not cache binding material. */
export function createKeyringFromWorkerEnv(env: WorkerEnv): Keyring {
  return createKeyringFromSecretsStoreBinding(env.INSTANCE_ROOT_KEY);
}
