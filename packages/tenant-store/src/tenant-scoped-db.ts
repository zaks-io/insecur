import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { activeRuntimeConnection, getRuntimeSql } from "./db/connection.js";
import { tenantStoreSchema, type TenantStoreSchema } from "./db/tenant-store-schema.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/**
 * Drizzle client for tenant-owned metadata. Root pool client; use inside `withTenantScope`
 * via the transaction-bound handle passed to the callback.
 */
export type TenantScopedDb = PostgresJsDatabase<TenantStoreSchema>;

let fallbackTenantDb: TenantScopedDb | undefined;

/**
 * Root runtime Drizzle client (ADR-0037). On the Worker path it is built over the request-scoped
 * connection and cached on that request's connection entry, so it never outlives the request. On the
 * Node/local fallback path it memoizes a single client over the fallback pool.
 */
export function getRuntimeTenantDb(): TenantScopedDb {
  const active = activeRuntimeConnection();
  if (active) {
    active.tenantDb ??= drizzle(active.sql, { schema: tenantStoreSchema });
    return active.tenantDb as TenantScopedDb;
  }
  fallbackTenantDb ??= drizzle(getRuntimeSql(), { schema: tenantStoreSchema });
  return fallbackTenantDb;
}

export function resetRuntimeTenantDb(): void {
  fallbackTenantDb = undefined;
}

/**
 * postgres.js handle for the active Drizzle transaction (raw `set_config`, legacy tagged SQL).
 * Only valid inside `withTenantScope`.
 */
export function tenantScopedSql(db: TenantScopedDb): TenantScopedSql {
  const session = (db as unknown as { session: { client: TenantScopedSql } }).session;
  return session.client;
}
