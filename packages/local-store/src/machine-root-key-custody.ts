import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";
import { generateMachineRootKeyHex } from "./machine-root-key.js";
import {
  resolveMachineRootKeyLockPath,
  withMachineRootKeyCreationLock,
} from "./machine-root-key-lock.js";
import type { KeyStoreDependencies } from "./types.js";

export async function getOrCreateMachineRootKeyWithCrossProcessLock(
  deps: KeyStoreDependencies,
  lookup: () => Promise<string | null>,
  persist: (keyHex: string) => Promise<void>,
): Promise<string> {
  const existing = await lookup();
  if (existing !== null) {
    return existing;
  }

  const lockPath = resolveMachineRootKeyLockPath(deps.paths.userConfigDir);
  return withMachineRootKeyCreationLock(lockPath, async () => {
    const raced = await lookup();
    if (raced !== null) {
      return raced;
    }

    const keyHex = generateMachineRootKeyHex(deps.randomBytes);
    await persist(keyHex);

    const persisted = await lookup();
    if (persisted === null) {
      throw new KeyStoreError(
        KEY_STORE_ERROR_CODES.adapterFailed,
        "machine root key store did not persist",
      );
    }
    return persisted;
  });
}
