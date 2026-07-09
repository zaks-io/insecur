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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  closeLocalSqliteDatabase,
  openLocalSqliteDatabase,
} from "../../packages/local-store/src/sqlite/connection.ts";

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

  console.log("bun-sqlite-seam-probe passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
