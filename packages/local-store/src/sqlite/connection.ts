import { chmodSync, closeSync, constants as fsConstants, mkdirSync, openSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { LOCAL_STORE_SCHEMA_SQL, LOCAL_STORE_SCHEMA_VERSION } from "./schema.js";

type LocalSqliteParameter = string | number | bigint | null | Uint8Array;

interface LocalSqliteStatement {
  all(...parameters: readonly LocalSqliteParameter[]): unknown[];
  get(...parameters: readonly LocalSqliteParameter[]): unknown;
  run(...parameters: readonly LocalSqliteParameter[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

export interface LocalSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): LocalSqliteStatement;
  close(): void;
}

const requireRuntimeModule = createRequire(import.meta.url);

// Bun-compiled release binaries have no node:sqlite and Node has no bun:sqlite,
// so the driver must be picked at runtime. The two drivers share this file's
// whole API surface except that bun:sqlite get() returns null for a missing row
// where node:sqlite returns undefined.
function openRuntimeSqliteDatabase(databaseFilePath: string): LocalSqliteDatabase {
  if (process.versions.bun !== undefined) {
    const { Database } = requireRuntimeModule("bun:sqlite") as {
      Database: new (databaseFilePath: string) => LocalSqliteDatabase;
    };
    const database = new Database(databaseFilePath);
    return {
      exec: (sql) => {
        database.exec(sql);
      },
      prepare: (sql) => {
        const statement = database.prepare(sql);
        return {
          all: (...parameters) => statement.all(...parameters),
          get: (...parameters) => statement.get(...parameters) ?? undefined,
          run: (...parameters) => statement.run(...parameters),
        };
      },
      close: () => {
        database.close();
      },
    };
  }
  const { DatabaseSync } = requireRuntimeModule("node:sqlite") as {
    DatabaseSync: new (databaseFilePath: string) => LocalSqliteDatabase;
  };
  return new DatabaseSync(databaseFilePath);
}

function localStoreMetaTableExists(database: LocalSqliteDatabase): boolean {
  const row = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get("local_store_meta") as { name: string } | undefined;
  return row !== undefined;
}

function readPersistedSchemaVersion(database: LocalSqliteDatabase): number | null {
  if (!localStoreMetaTableExists(database)) {
    return null;
  }
  const versionRow = database
    .prepare("SELECT value FROM local_store_meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;
  if (versionRow === undefined) {
    return null;
  }
  const parsed = Number(versionRow.value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertCurrentSchemaVersion(database: LocalSqliteDatabase): void {
  const versionRow = database
    .prepare("SELECT value FROM local_store_meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;
  if (versionRow === undefined || Number(versionRow.value) !== LOCAL_STORE_SCHEMA_VERSION) {
    throw new Error("unsupported local store schema version");
  }
}

function preparePrivateDatabaseFile(databaseFilePath: string): void {
  const directory = path.dirname(databaseFilePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  closeSync(openSync(databaseFilePath, fsConstants.O_CREAT | fsConstants.O_RDWR, 0o600));
  chmodSync(databaseFilePath, 0o600);
}

function initializeLocalStoreSchema(database: LocalSqliteDatabase): void {
  database.exec("PRAGMA foreign_keys = ON");
  const existingVersion = readPersistedSchemaVersion(database);
  if (existingVersion !== null && existingVersion !== LOCAL_STORE_SCHEMA_VERSION) {
    throw new Error("unsupported local store schema version");
  }
  database.exec(LOCAL_STORE_SCHEMA_SQL);
  database
    .prepare("INSERT OR IGNORE INTO local_store_meta (key, value) VALUES (?, ?)")
    .run("schema_version", String(LOCAL_STORE_SCHEMA_VERSION));
  assertCurrentSchemaVersion(database);
}

export function openLocalSqliteDatabase(databaseFilePath: string): LocalSqliteDatabase {
  preparePrivateDatabaseFile(databaseFilePath);
  const database = openRuntimeSqliteDatabase(databaseFilePath);
  try {
    initializeLocalStoreSchema(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function closeLocalSqliteDatabase(database: LocalSqliteDatabase): void {
  database.close();
}
