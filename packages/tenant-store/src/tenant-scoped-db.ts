import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { tenantStoreSchema, type TenantStoreSchema } from "./db/tenant-store-schema.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/**
 * Transaction-bound Drizzle client available only inside `withTenantScope`.
 * Created from the same postgres.js transaction handle as tenant-scope `set_config`.
 */
export type TenantScopedDb = PostgresJsDatabase<TenantStoreSchema>;

export function createTenantScopedDb(sql: TenantScopedSql): TenantScopedDb {
  return drizzle(sql as Sql, { schema: tenantStoreSchema });
}
