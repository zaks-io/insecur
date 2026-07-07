import type { LocalSqliteDatabase } from "./connection.js";

export function withSqliteTransaction(database: LocalSqliteDatabase, run: () => void): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
