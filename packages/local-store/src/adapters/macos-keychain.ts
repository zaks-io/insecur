import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
import { assertMachineRootKeyHex, generateMachineRootKeyHex } from "../machine-root-key.js";
import type { KeyStoreAdapter, KeyStoreDependencies } from "../types.js";

const MACOS_SECURITY = "/usr/bin/security";

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
  return code === "ENOENT" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

function isSecurityItemMissing(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("could not be found") ||
    normalized.includes("secitemcopymatching") ||
    normalized.includes("the specified item could not be found")
  );
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
  return isNotFoundError(error) || isSecurityItemMissing(readLookupStderr(error));
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
    throw new KeyStoreError(KEY_STORE_ERROR_CODES.adapterFailed, "macOS keychain lookup failed");
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
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-w",
      keyHex,
    ]);
  } catch {
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
      const existing = await lookupMacosKey(deps, service, account);
      if (existing !== null) {
        return existing;
      }

      const keyHex = generateMachineRootKeyHex(deps.randomBytes);
      await storeMacosKey(deps, service, account, keyHex);
      return keyHex;
    },
  };
}
