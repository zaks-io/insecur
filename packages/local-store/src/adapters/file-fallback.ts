import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
import { assertMachineRootKeyHex, generateMachineRootKeyHex } from "../machine-root-key.js";
import { FILE_FALLBACK_NOTICE } from "../notices.js";
import type { KeyStoreAdapter, KeyStoreDependencies } from "../types.js";

const PRIVATE_FILE_MODE = 0o600;

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function writePrivateKeyFile(filePath: string, keyHex: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, keyHex, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
  await chmod(filePath, PRIVATE_FILE_MODE);
}

export function createFileFallbackAdapter(deps: KeyStoreDependencies): KeyStoreAdapter {
  return {
    backend: "file-fallback",
    notice: FILE_FALLBACK_NOTICE,
    async getOrCreateMachineRootKey() {
      const filePath = deps.paths.machineRootKeyFilePath;

      try {
        const existing = await readFile(filePath, "utf8");
        return assertMachineRootKeyHex(existing);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw new KeyStoreError(
            KEY_STORE_ERROR_CODES.adapterFailed,
            "file fallback key lookup failed",
          );
        }
      }

      const keyHex = generateMachineRootKeyHex(deps.randomBytes);
      try {
        await writePrivateKeyFile(filePath, keyHex);
      } catch {
        throw new KeyStoreError(
          KEY_STORE_ERROR_CODES.adapterFailed,
          "file fallback key store failed",
        );
      }

      return keyHex;
    },
  };
}
