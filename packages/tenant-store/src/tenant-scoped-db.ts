import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { getRuntimeSql } from "./db/connection.js";
import { tenantStoreSchema, type TenantStoreSchema } from "./db/tenant-store-schema.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/**
 * Transaction-bound Drizzle client available only inside `withTenantScope`.
 * Created from the same postgres.js transaction handle as tenant-scope `set_config`.
 */
export type TenantScopedDb = PostgresJsDatabase<TenantStoreSchema>;

/**
 * postgres.js `TransactionSql` handles omit `options`; Drizzle's driver constructor
 * expects `options.parsers` on the client (same as its own `sql.begin` transactions).
 */
function asDrizzlePostgresClient(sql: TenantScopedSql): Sql {
  const client = sql as Sql;
  if ("options" in client) {
    return client;
  }
  const root = getRuntimeSql();
  Object.assign(client, { options: root.options });
  return client;
}

export function createTenantScopedDb(sql: TenantScopedSql): TenantScopedDb {
  return drizzle(asDrizzlePostgresClient(sql), { schema: tenantStoreSchema });
}
