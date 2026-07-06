import { access, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

import { MACHINE_ROOT_KEY_CREATE_LOCK_FILE_NAME } from "./constants.js";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";

const LOCK_FILE_MODE = 0o600;
const LOCK_POLL_MS = 50;
const LOCK_MAX_WAIT_MS = 30_000;

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function resolveMachineRootKeyLockPath(userConfigDir: string): string {
  return path.join(userConfigDir, MACHINE_ROOT_KEY_CREATE_LOCK_FILE_NAME);
}

async function ensureLockDirectory(lockPath: string): Promise<void> {
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
}

async function tryAcquireLock(lockPath: string): Promise<"acquired" | "exists"> {
  await ensureLockDirectory(lockPath);
  try {
    const handle = await open(lockPath, "wx", LOCK_FILE_MODE);
    await handle.close();
    return "acquired";
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      return "exists";
    }
    throw error;
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error) {
    if (!isErrnoCode(error, "ENOENT")) {
      throw error;
    }
  }
}

async function waitForLockRelease(lockPath: string, deadlineMs: number): Promise<void> {
  while (Date.now() < deadlineMs) {
    try {
      await access(lockPath);
      await sleep(LOCK_POLL_MS);
    } catch (error) {
      if (isErrnoCode(error, "ENOENT")) {
        return;
      }
      throw error;
    }
  }
}

export async function withMachineRootKeyCreationLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const deadlineMs = Date.now() + LOCK_MAX_WAIT_MS;

  while (Date.now() < deadlineMs) {
    const outcome = await tryAcquireLock(lockPath);
    if (outcome === "acquired") {
      try {
        return await operation();
      } finally {
        await releaseLock(lockPath);
      }
    }

    await waitForLockRelease(lockPath, deadlineMs);
  }

  throw new KeyStoreError(
    KEY_STORE_ERROR_CODES.adapterFailed,
    "machine root key creation lock timed out",
  );
}
