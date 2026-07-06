import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
import { sanitizeChildProcessFailureCause } from "../exec-file-error.js";
import { getOrCreateMachineRootKeyWithCrossProcessLock } from "../machine-root-key-custody.js";
import { assertMachineRootKeyHex } from "../machine-root-key.js";
import type { KeyStoreAdapter, KeyStoreDependencies } from "../types.js";

function isLookupMiss(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code === "ENOENT") {
    return true;
  }
  const stderr =
    "stderr" in error && typeof (error as { stderr?: string }).stderr === "string"
      ? (error as { stderr: string }).stderr
      : "";
  return stderr.toLowerCase().includes("no matching results");
}

async function lookupLinuxSecret(
  deps: KeyStoreDependencies,
  service: string,
  account: string,
): Promise<string | null> {
  try {
    const found = await deps.execFile("secret-tool", [
      "lookup",
      "service",
      service,
      "account",
      account,
    ]);
    return assertMachineRootKeyHex(found.stdout);
  } catch (error) {
    if (isLookupMiss(error)) {
      return null;
    }
    throw new KeyStoreError(
      KEY_STORE_ERROR_CODES.adapterFailed,
      "Linux secret-tool lookup failed",
      { cause: sanitizeChildProcessFailureCause(error) },
    );
  }
}

async function storeLinuxSecret(
  deps: KeyStoreDependencies,
  service: string,
  account: string,
  keyHex: string,
): Promise<void> {
  try {
    await deps.execFile(
      "secret-tool",
      ["store", "--label=insecur machine root key", "service", service, "account", account],
      { input: keyHex },
    );
  } catch (error) {
    throw new KeyStoreError(KEY_STORE_ERROR_CODES.adapterFailed, "Linux secret-tool store failed", {
      cause: sanitizeChildProcessFailureCause(error),
    });
  }
}

export function createLinuxSecretToolAdapter(
  deps: KeyStoreDependencies,
  service: string,
  account: string,
): KeyStoreAdapter {
  return {
    backend: "linux-secret-tool",
    notice: null,
    async getOrCreateMachineRootKey() {
      return getOrCreateMachineRootKeyWithCrossProcessLock(
        deps,
        () => lookupLinuxSecret(deps, service, account),
        (keyHex) => storeLinuxSecret(deps, service, account, keyHex),
      );
    },
  };
}
