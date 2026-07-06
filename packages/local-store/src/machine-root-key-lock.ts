import { access, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { MACHINE_ROOT_KEY_CREATE_LOCK_FILE_NAME } from "./constants.js";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";

const LOCK_FILE_MODE = 0o600;
const LOCK_POLL_MS = 50;
const LOCK_MAX_WAIT_MS = 30_000;
const LOCK_STALE_MS = 30_000;

interface LockMetadata {
  readonly pid: number;
  readonly acquiredAt: number;
}

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

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "pid" in parsed &&
      "acquiredAt" in parsed &&
      typeof (parsed as LockMetadata).pid === "number" &&
      typeof (parsed as LockMetadata).acquiredAt === "number"
    ) {
      return parsed as LockMetadata;
    }
  } catch {
    return null;
  }
  return null;
}

export async function isStaleMachineRootKeyLock(lockPath: string): Promise<boolean> {
  const metadata = await readLockMetadata(lockPath);
  if (metadata !== null) {
    if (!isPidAlive(metadata.pid)) {
      return true;
    }
    return Date.now() - metadata.acquiredAt > LOCK_STALE_MS;
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

async function tryAcquireLock(lockPath: string): Promise<"acquired" | "exists"> {
  await ensureLockDirectory(lockPath);
  try {
    const handle = await open(lockPath, "wx", LOCK_FILE_MODE);
    try {
      const metadata: LockMetadata = { pid: process.pid, acquiredAt: Date.now() };
      await handle.writeFile(JSON.stringify(metadata), "utf8");
    } finally {
      await handle.close();
    }
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

async function removeStaleLock(lockPath: string): Promise<void> {
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
    await releaseLock(lockPath);
  }
}

async function waitForActiveLock<T>(
  lockPath: string,
  reconcile?: () => Promise<T | null>,
): Promise<"retry" | T> {
  if (await isStaleMachineRootKeyLock(lockPath)) {
    const persisted = await reconcileOrNull(reconcile);
    if (persisted !== null) {
      return persisted;
    }
    await removeStaleLock(lockPath);
    return "retry";
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
    if (outcome === "acquired") {
      return runWhenLockAcquired(lockPath, operation, reconcile);
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
