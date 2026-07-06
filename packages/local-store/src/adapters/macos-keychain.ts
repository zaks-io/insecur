import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
import { sanitizeChildProcessFailureCause } from "../exec-file-error.js";
import { getOrCreateMachineRootKeyWithCrossProcessLock } from "../machine-root-key-custody.js";
import { assertMachineRootKeyHex } from "../machine-root-key.js";
import type { KeyStoreAdapter, KeyStoreDependencies } from "../types.js";

const MACOS_SECURITY = "/usr/bin/security";

function isSecurityItemMissing(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("could not be found") ||
    normalized.includes("secitemcopymatching") ||
    normalized.includes("the specified item could not be found")
  );
}

function isDuplicateKeychainItem(stderr: string): boolean {
  return stderr.toLowerCase().includes("already exists");
}

function readLookupStderr(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const stderr = (error as { stderr?: string }).stderr;
    return stderr ?? "";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "";
}

function isMissingKeychainItem(error: unknown): boolean {
  return isSecurityItemMissing(readLookupStderr(error));
}

function isDuplicateKeychainItemError(error: unknown): boolean {
  return isDuplicateKeychainItem(readLookupStderr(error));
}

async function lookupMacosKey(
  deps: KeyStoreDependencies,
  service: string,
  account: string,
): Promise<string | null> {
  try {
    const found = await deps.execFile(MACOS_SECURITY, [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ]);
    return assertMachineRootKeyHex(found.stdout);
  } catch (error) {
    if (isMissingKeychainItem(error)) {
      return null;
    }
    throw new KeyStoreError(KEY_STORE_ERROR_CODES.adapterFailed, "macOS keychain lookup failed", {
      cause: sanitizeChildProcessFailureCause(error),
    });
  }
}

async function storeMacosKey(
  deps: KeyStoreDependencies,
  service: string,
  account: string,
  keyHex: string,
): Promise<void> {
  try {
    await deps.execFile(MACOS_SECURITY, [
      "add-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
      keyHex,
    ]);
  } catch (error) {
    if (isDuplicateKeychainItemError(error)) {
      return;
    }
    throw new KeyStoreError(KEY_STORE_ERROR_CODES.adapterFailed, "macOS keychain store failed");
  }
}

export function createMacosKeychainAdapter(
  deps: KeyStoreDependencies,
  service: string,
  account: string,
): KeyStoreAdapter {
  return {
    backend: "macos-keychain",
    notice: null,
    async getOrCreateMachineRootKey() {
      return getOrCreateMachineRootKeyWithCrossProcessLock(
        deps,
        () => lookupMacosKey(deps, service, account),
        (keyHex) => storeMacosKey(deps, service, account, keyHex),
      );
    },
  };
}
