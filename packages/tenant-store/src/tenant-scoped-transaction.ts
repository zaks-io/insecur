import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm";
import type { PgDialect } from "drizzle-orm/pg-core/dialect";
import { PostgresJsSession, PostgresJsTransaction } from "drizzle-orm/postgres-js";

import { tenantStoreSchema } from "./db/tenant-store-schema.js";
import { getRuntimeTenantDb, type TenantScopedDb } from "./tenant-scoped-db.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

const tenantStoreRelationalSchema = buildTenantStoreRelationalSchema();

function buildTenantStoreRelationalSchema() {
  const tablesConfig = extractTablesRelationalConfig(
    tenantStoreSchema,
    createTableRelationsHelpers,
  );
  return {
    fullSchema: tenantStoreSchema,
    schema: tablesConfig.tables,
    tableNamesMap: tablesConfig.tableNamesMap,
  };
}

/**
 * Explicit tenant transaction handles. The postgres.js client must be supplied by the caller
 * (for example from `sql.begin`); Drizzle does not expose a stable public API for reading it back.
 */
export interface TenantScopedTransaction {
  readonly db: TenantScopedDb;
  readonly sql: TenantScopedSql;
}

/** Drizzle root DB exposes dialect at runtime; the public type omits it. */
function tenantDbDialect(rootDb: TenantScopedDb): PgDialect {
  return (rootDb as TenantScopedDb & { dialect: PgDialect }).dialect;
}

/**
 * Build Drizzle and tagged-SQL handles over the same postgres.js transaction client.
 * Mirrors Drizzle's postgres-js transaction setup without calling `drizzle()` on the
 * transaction client (TransactionSql has no `options.parsers` for driver bootstrap).
 */
export function createTenantScopedTransaction(sql: TenantScopedSql): TenantScopedTransaction {
  const rootDb = getRuntimeTenantDb();
  const dialect = tenantDbDialect(rootDb);
  const txSession = new PostgresJsSession(sql as never, dialect, tenantStoreRelationalSchema);
  const db = new PostgresJsTransaction(
    dialect,
    txSession as never,
    tenantStoreRelationalSchema as never,
  ) as TenantScopedDb;
  return { db, sql };
}
