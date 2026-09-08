#!/usr/bin/env bun
/**
 * Bun-runtime seam probe for the local-store sqlite driver adapter.
 *
 * The compiled release binary runs under Bun while unit tests run under Node,
 * so the driver seam (bun:sqlite vs node:sqlite) is the one place runtime
 * semantics can drift silently. This probe exercises the real adapter under
 * Bun and pins the divergences the adapter must normalize (missing-row get()
 * returns undefined, run() reports changes, multi-statement schema exec).
 *
 * Run with: bun scripts/ci/bun-sqlite-seam-probe.mjs
 * (Bun imports the TypeScript adapter source directly.)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  closeLocalSqliteDatabase,
  openBareLocalSqliteDatabase,
  openLocalSqliteDatabase,
} from "../../packages/local-store/src/sqlite/connection.ts";
import {
  resolveMachineRootKeyLockPath,
  withMachineRootKeyCreationLock,
} from "../../packages/local-store/src/machine-root-key-lock.ts";

if (process.versions.bun === undefined) {
  console.error("bun-sqlite-seam-probe must run under Bun, not Node.");
  process.exit(1);
}

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

function isDisposableCleanupLock(error) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EBUSY" || error.code === "EPERM" || error.code === "ENOTEMPTY")
  );
}

const tempDir = mkdtempSync(path.join(tmpdir(), "insecur-bun-sqlite-seam-"));
try {
  const database = openLocalSqliteDatabase(path.join(tempDir, "nested", "probe.sqlite"));
  try {
    const versionRow = database
      .prepare("SELECT value FROM local_store_meta WHERE key = ?")
      .get("schema_version");
    assert(versionRow !== undefined && versionRow !== null, "schema initialized under Bun");

    const missing = database
      .prepare("SELECT value FROM local_store_meta WHERE key = ?")
      .get("no-such-key");
    assert(missing === undefined, "missing-row get() normalizes to undefined");

    const inserted = database
      .prepare("INSERT OR IGNORE INTO local_store_meta (key, value) VALUES (?, ?)")
      .run("bun-seam-probe", "1");
    assert(Number(inserted.changes) === 1, "run() reports changes");

    const rows = database.prepare("SELECT key FROM local_store_meta ORDER BY key").all();
    assert(Array.isArray(rows) && rows.length >= 2, "all() returns rows");

    database.exec("BEGIN IMMEDIATE");
    database
      .prepare("UPDATE local_store_meta SET value = ? WHERE key = ?")
      .run("2", "bun-seam-probe");
    database.exec("ROLLBACK");
    const rolledBack = database
      .prepare("SELECT value FROM local_store_meta WHERE key = ?")
      .get("bun-seam-probe");
    assert(rolledBack.value === "1", "manual transaction rollback works");
  } finally {
    closeLocalSqliteDatabase(database);
  }

  const reopened = openLocalSqliteDatabase(path.join(tempDir, "nested", "probe.sqlite"));
  try {
    const persisted = reopened
      .prepare("SELECT value FROM local_store_meta WHERE key = ?")
      .get("bun-seam-probe");
    assert(persisted.value === "1", "reopen sees persisted rows");
  } finally {
    closeLocalSqliteDatabase(reopened);
  }

  const lockPath = resolveMachineRootKeyLockPath(tempDir);
  writeFileSync(
    lockPath,
    JSON.stringify({ pid: 9_999_999, acquiredAt: 0, token: "dead-holder-token" }),
    { mode: 0o600 },
  );
  let activeCreators = 0;
  let maxActiveCreators = 0;
  const createUnderLock = () =>
    withMachineRootKeyCreationLock(lockPath, async () => {
      activeCreators += 1;
      maxActiveCreators = Math.max(maxActiveCreators, activeCreators);
      await Bun.sleep(25);
      activeCreators -= 1;
      return "created";
    });
  const creationResults = await Promise.all([createUnderLock(), createUnderLock()]);
  assert(
    creationResults.every((result) => result === "created") && maxActiveCreators === 1,
    "machine root key stale recovery serializes under Bun",
  );

  writeFileSync(
    lockPath,
    JSON.stringify({ pid: 9_999_999, acquiredAt: 0, token: "dead-holder-token-2" }),
    { mode: 0o600 },
  );
  const abandonedRecovery = openBareLocalSqliteDatabase(`${lockPath}.recovery.sqlite`);
  abandonedRecovery.exec("BEGIN IMMEDIATE");
  let recoverySettled = false;
  let reconcileCalls = 0;
  let busyRetryPreservedStaleLock = false;
  let signalBusyRetry;
  const busyRetryReached = new Promise((resolve) => {
    signalBusyRetry = resolve;
  });
  const pendingRecovery = withMachineRootKeyCreationLock(
    lockPath,
    () => Promise.resolve("recovered"),
    () => {
      reconcileCalls += 1;
      if (reconcileCalls === 3) {
        try {
          const preserved = JSON.parse(readFileSync(lockPath, "utf8"));
          busyRetryPreservedStaleLock = preserved.token === "dead-holder-token-2";
        } catch {
          busyRetryPreservedStaleLock = false;
        }
        signalBusyRetry();
      }
      return Promise.resolve(null);
    },
  ).then(
    (value) => {
      recoverySettled = true;
      return { value };
    },
    (error) => {
      recoverySettled = true;
      return { error };
    },
  );
  let recoveryTimeout;
  const recoveryTimedOut = new Promise((resolve) => {
    recoveryTimeout = setTimeout(() => {
      resolve("timed_out");
    }, 5_000);
  });
  const recoveryEvent = await Promise.race([
    busyRetryReached.then(() => "retried"),
    pendingRecovery.then(() => "settled"),
    recoveryTimedOut,
  ]);
  clearTimeout(recoveryTimeout);
  const waitedForRecoveryMutex =
    recoveryEvent === "retried" && !recoverySettled && busyRetryPreservedStaleLock;
  closeLocalSqliteDatabase(abandonedRecovery);
  const recoveryOutcome = await pendingRecovery;
  assert(
    waitedForRecoveryMutex,
    "Bun SQLITE_BUSY keeps stale recovery pending until the mutex is released",
  );
  if ("error" in recoveryOutcome) {
    throw recoveryOutcome.error;
  }
  assert(
    recoveryOutcome.value === "recovered",
    "abandoned Bun recovery transactions release their mutex",
  );

  console.log("bun-sqlite-seam-probe passed");
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    if (!isDisposableCleanupLock(error)) {
      throw error;
    }
    console.warn(`warning: disposable Bun SQLite probe cleanup deferred (${error.code})`);
  }
}
