import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getRuntimeSql } from "./db/connection.js";
import { tenantStoreSchema, type TenantStoreSchema } from "./db/tenant-store-schema.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/**
 * Drizzle client for tenant-owned metadata. Root pool client; use inside `withTenantScope`
 * via the transaction-bound handle passed to the callback.
 */
export type TenantScopedDb = PostgresJsDatabase<TenantStoreSchema>;

let runtimeTenantDb: TenantScopedDb | undefined;

/** Root runtime Drizzle client (private pool; ADR-0037). */
export function getRuntimeTenantDb(): TenantScopedDb {
  runtimeTenantDb ??= drizzle(getRuntimeSql(), { schema: tenantStoreSchema });
  return runtimeTenantDb;
}

export function resetRuntimeTenantDb(): void {
  runtimeTenantDb = undefined;
}

/**
 * postgres.js handle for the active Drizzle transaction (raw `set_config`, legacy tagged SQL).
 * Only valid inside `withTenantScope`.
 */
export function tenantScopedSql(db: TenantScopedDb): TenantScopedSql {
  const session = (db as unknown as { session: { client: TenantScopedSql } }).session;
  return session.client;
}
