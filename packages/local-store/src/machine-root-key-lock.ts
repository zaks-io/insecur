import { randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { MACHINE_ROOT_KEY_CREATE_LOCK_FILE_NAME } from "./constants.js";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";
import {
  isMetadataStale,
  LOCK_STALE_MS,
  lockMetadataIdentityMatches,
  type LockMetadata,
  parseLockMetadata,
} from "./machine-root-key-lock-metadata.js";

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

async function readLockMetadata(lockPath: string): Promise<LockMetadata | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    return parseLockMetadata(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function isStaleMachineRootKeyLock(lockPath: string): Promise<boolean> {
  const metadata = await readLockMetadata(lockPath);
  if (metadata !== null) {
    return isMetadataStale(metadata);
  }

  try {
    const lockStat = await stat(lockPath);
    return Date.now() - lockStat.mtimeMs > LOCK_STALE_MS;
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

async function tryAcquireLock(
  lockPath: string,
): Promise<{ status: "acquired"; token: string } | { status: "exists" }> {
  const token = randomUUID();
  await ensureLockDirectory(lockPath);
  try {
    const handle = await open(lockPath, "wx", LOCK_FILE_MODE);
    try {
      const metadata: LockMetadata = { pid: process.pid, acquiredAt: Date.now(), token };
      await handle.writeFile(JSON.stringify(metadata), "utf8");
    } finally {
      await handle.close();
    }
    return { status: "acquired", token };
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      return { status: "exists" };
    }
    throw error;
  }
}

async function releaseLock(lockPath: string, holderToken: string): Promise<void> {
  const current = await readLockMetadata(lockPath);
  if (current?.token !== holderToken) {
    return;
  }
  try {
    await unlink(lockPath);
  } catch (error) {
    if (!isErrnoCode(error, "ENOENT")) {
      throw error;
    }
  }
}

async function removeStaleLockIfMatches(
  lockPath: string,
  staleSnapshot: LockMetadata,
): Promise<void> {
  const current = await readLockMetadata(lockPath);
  if (!lockMetadataIdentityMatches(current, staleSnapshot)) {
    return;
  }
  if (current === null || !isMetadataStale(current)) {
    return;
  }
  try {
    await unlink(lockPath);
  } catch (error) {
    if (!isErrnoCode(error, "ENOENT")) {
      throw error;
    }
  }
}

async function reconcileOrNull<T>(reconcile?: () => Promise<T | null>): Promise<T | null> {
  if (reconcile === undefined) {
    return null;
  }
  return reconcile();
}

async function runWhenLockAcquired<T>(
  lockPath: string,
  holderToken: string,
  operation: () => Promise<T>,
  reconcile?: () => Promise<T | null>,
): Promise<T> {
  const raced = await reconcileOrNull(reconcile);
  if (raced !== null) {
    return raced;
  }
  try {
    return await operation();
  } finally {
    await releaseLock(lockPath, holderToken);
  }
}

async function waitForTokenizedStaleLock<T>(
  lockPath: string,
  staleSnapshot: LockMetadata,
  reconcile?: () => Promise<T | null>,
): Promise<"retry" | T> {
  const persisted = await reconcileOrNull(reconcile);
  if (persisted !== null) {
    return persisted;
  }
  await removeStaleLockIfMatches(lockPath, staleSnapshot);
  return "retry";
}

async function waitForLegacyStaleLock<T>(
  lockPath: string,
  reconcile?: () => Promise<T | null>,
): Promise<"retry" | T> {
  const persisted = await reconcileOrNull(reconcile);
  if (persisted !== null) {
    return persisted;
  }
  if (await isStaleMachineRootKeyLock(lockPath)) {
    try {
      await unlink(lockPath);
    } catch (error) {
      if (!isErrnoCode(error, "ENOENT")) {
        throw error;
      }
    }
  }
  return "retry";
}

async function waitForActiveLock<T>(
  lockPath: string,
  reconcile?: () => Promise<T | null>,
): Promise<"retry" | T> {
  const staleSnapshot = await readLockMetadata(lockPath);
  if (staleSnapshot !== null && isMetadataStale(staleSnapshot)) {
    return waitForTokenizedStaleLock(lockPath, staleSnapshot, reconcile);
  }
  if (staleSnapshot === null && (await isStaleMachineRootKeyLock(lockPath))) {
    return waitForLegacyStaleLock(lockPath, reconcile);
  }

  try {
    await access(lockPath);
  } catch (error) {
    if (isErrnoCode(error, "ENOENT")) {
      return "retry";
    }
    throw error;
  }

  await sleep(LOCK_POLL_MS);
  return "retry";
}

export async function withMachineRootKeyCreationLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  reconcile?: () => Promise<T | null>,
): Promise<T> {
  const deadlineMs = Date.now() + LOCK_MAX_WAIT_MS;

  while (Date.now() < deadlineMs) {
    const reconciled = await reconcileOrNull(reconcile);
    if (reconciled !== null) {
      return reconciled;
    }

    const outcome = await tryAcquireLock(lockPath);
    if (outcome.status === "acquired") {
      return runWhenLockAcquired(lockPath, outcome.token, operation, reconcile);
    }

    const contention = await waitForActiveLock(lockPath, reconcile);
    if (contention !== "retry") {
      return contention;
    }
  }

  throw new KeyStoreError(
    KEY_STORE_ERROR_CODES.adapterFailed,
    "machine root key creation lock timed out",
  );
}
