import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LOCAL_STORE_SCHEMA_SQL, LOCAL_STORE_SCHEMA_VERSION } from "./schema.js";

export type LocalSqliteDatabase = DatabaseSync;

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

export function openLocalSqliteDatabase(databaseFilePath: string): LocalSqliteDatabase {
  mkdirSync(path.dirname(databaseFilePath), { recursive: true });
  const database = new DatabaseSync(databaseFilePath);
  try {
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

    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function closeLocalSqliteDatabase(database: LocalSqliteDatabase): void {
  database.close();
}
