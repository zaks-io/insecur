import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LOCAL_STORE_SCHEMA_VERSION } from "./schema.js";
import { closeLocalSqliteDatabase, openLocalSqliteDatabase } from "./connection.js";

describe("openLocalSqliteDatabase", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "insecur-sqlite-connection-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects an old schema version without modifying the database file", () => {
    const databasePath = path.join(tempDir, "legacy.sqlite");
    mkdirSync(path.dirname(databasePath), { recursive: true });
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(
      `CREATE TABLE local_store_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
    );
    legacy
      .prepare(`INSERT INTO local_store_meta (key, value) VALUES (?, ?)`)
      .run("schema_version", "1");
    legacy.close();
    const bytesBefore = readFileSync(databasePath);

    expect(() => openLocalSqliteDatabase(databasePath)).toThrow(
      "unsupported local store schema version",
    );

    const bytesAfter = readFileSync(databasePath);
    expect(bytesAfter.equals(bytesBefore)).toBe(true);

    const reopened = new DatabaseSync(databasePath);
    const versionRow = reopened
      .prepare(`SELECT value FROM local_store_meta WHERE key = ?`)
      .get("schema_version") as { value: string };
    expect(versionRow.value).toBe("1");
    reopened.close();
  });

  it("initializes a fresh database to the current schema version", () => {
    const databasePath = path.join(tempDir, "fresh.sqlite");
    const database = openLocalSqliteDatabase(databasePath);
    try {
      const versionRow = database
        .prepare(`SELECT value FROM local_store_meta WHERE key = ?`)
        .get("schema_version") as { value: string };
      expect(Number(versionRow.value)).toBe(LOCAL_STORE_SCHEMA_VERSION);
    } finally {
      closeLocalSqliteDatabase(database);
    }
  });

  it("uses INSERT OR IGNORE when stamping schema_version on first open", () => {
    const databasePath = path.join(tempDir, "stamped.sqlite");
    writeFileSync(databasePath, "");
    const first = openLocalSqliteDatabase(databasePath);
    closeLocalSqliteDatabase(first);

    const second = openLocalSqliteDatabase(databasePath);
    try {
      const versionRow = second
        .prepare(`SELECT value FROM local_store_meta WHERE key = ?`)
        .get("schema_version") as { value: string };
      expect(Number(versionRow.value)).toBe(LOCAL_STORE_SCHEMA_VERSION);
    } finally {
      closeLocalSqliteDatabase(second);
    }
  });
});
