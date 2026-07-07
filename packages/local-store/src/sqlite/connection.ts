import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LOCAL_STORE_SCHEMA_SQL, LOCAL_STORE_SCHEMA_VERSION } from "./schema.js";

export type LocalSqliteDatabase = DatabaseSync;

export function openLocalSqliteDatabase(databaseFilePath: string): LocalSqliteDatabase {
  mkdirSync(path.dirname(databaseFilePath), { recursive: true });
  const database = new DatabaseSync(databaseFilePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(LOCAL_STORE_SCHEMA_SQL);
  const versionRow = database
    .prepare("SELECT value FROM local_store_meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;
  if (versionRow === undefined) {
    database
      .prepare("INSERT INTO local_store_meta (key, value) VALUES (?, ?)")
      .run("schema_version", String(LOCAL_STORE_SCHEMA_VERSION));
  } else if (Number(versionRow.value) !== LOCAL_STORE_SCHEMA_VERSION) {
    throw new Error("unsupported local store schema version");
  }
  return database;
}

export function closeLocalSqliteDatabase(database: LocalSqliteDatabase): void {
  database.close();
}
