import { chmod, mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
import { assertMachineRootKeyHex, generateMachineRootKeyHex } from "../machine-root-key.js";
import { FILE_FALLBACK_NOTICE } from "../notices.js";
import type { KeyStoreAdapter, KeyStoreDependencies } from "../types.js";

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function isMissingFileError(error: unknown): boolean {
  return isErrnoCode(error, "ENOENT");
}

function adapterFailed(message: string, cause?: unknown): KeyStoreError {
  return new KeyStoreError(KEY_STORE_ERROR_CODES.adapterFailed, message, { cause });
}

export async function ensurePrivateKeyDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE });
  await chmod(dirPath, PRIVATE_DIR_MODE);
}

async function readPrivateKeyFile(filePath: string): Promise<string | null> {
  try {
    const existing = await readFile(filePath, "utf8");
    return assertMachineRootKeyHex(existing);
  } catch (error) {
    if (error instanceof KeyStoreError) {
      throw error;
    }
    if (isMissingFileError(error)) {
      return null;
    }
    throw adapterFailed("file fallback key lookup failed", error);
  }
}

export async function writePrivateKeyFileExclusive(
  filePath: string,
  keyHex: string,
): Promise<"created" | "exists"> {
  await ensurePrivateKeyDirectory(path.dirname(filePath));
  try {
    const handle = await open(filePath, "wx", PRIVATE_FILE_MODE);
    try {
      await handle.writeFile(keyHex, "utf8");
    } finally {
      await handle.close();
    }
    await chmod(filePath, PRIVATE_FILE_MODE);
    return "created";
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      return "exists";
    }
    throw error;
  }
}

export async function writePrivateKeyFile(filePath: string, keyHex: string): Promise<void> {
  await ensurePrivateKeyDirectory(path.dirname(filePath));
  await writeFile(filePath, keyHex, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
  await chmod(filePath, PRIVATE_FILE_MODE);
}

async function createOrReadFallbackKey(
  deps: KeyStoreDependencies,
  filePath: string,
): Promise<string> {
  const existing = await readPrivateKeyFile(filePath);
  if (existing !== null) {
    return existing;
  }

  const keyHex = generateMachineRootKeyHex(deps.randomBytes);
  try {
    const outcome = await writePrivateKeyFileExclusive(filePath, keyHex);
    if (outcome === "created") {
      return keyHex;
    }

    const persisted = await readPrivateKeyFile(filePath);
    if (persisted === null) {
      throw adapterFailed("file fallback key store failed");
    }
    return persisted;
  } catch (error) {
    if (error instanceof KeyStoreError) {
      throw error;
    }
    throw adapterFailed("file fallback key store failed", error);
  }
}

export function createFileFallbackAdapter(deps: KeyStoreDependencies): KeyStoreAdapter {
  return {
    backend: "file-fallback",
    notice: FILE_FALLBACK_NOTICE,
    async getOrCreateMachineRootKey() {
      return createOrReadFallbackKey(deps, deps.paths.machineRootKeyFilePath);
    },
  };
}
