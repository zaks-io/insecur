import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { tenantStoreSchema } from "./db/tenant-store-schema.js";
import type { TenantScopedDb } from "./tenant-scoped-db.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/**
 * Explicit tenant transaction handles. The postgres.js client must be supplied by the caller
 * (for example from `sql.begin`); Drizzle does not expose a stable public API for reading it back.
 */
export interface TenantScopedTransaction {
  readonly db: TenantScopedDb;
  readonly sql: TenantScopedSql;
}

/**
 * Build Drizzle and tagged-SQL handles over the same postgres.js transaction client.
 * Only call this with a transaction-bound client from `withTenantScope`.
 */
export function createTenantScopedTransaction(sql: TenantScopedSql): TenantScopedTransaction {
  const db = drizzle(sql as Sql, { schema: tenantStoreSchema });
  return { db, sql };
}
