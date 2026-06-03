import { applyTenantScope } from "./apply-tenant-scope.js";
import { getRuntimeTenantDb, tenantScopedSql } from "./tenant-scoped-db.js";
import type { TenantScope, TenantScopedCallback } from "./tenant-scope.js";

/**
 * The only supported database entry point for tenant-owned metadata.
 * @see docs/adr/0037-tenant-scoped-bound-store-over-rls.md
 */
export async function withTenantScope<TResult>(
  scope: TenantScope,
  callback: TenantScopedCallback<TResult>,
): Promise<TResult> {
  const db = getRuntimeTenantDb();
  return db.transaction(async (txDb) => {
    await applyTenantScope(txDb, scope);
    return callback({ db: txDb, sql: tenantScopedSql(txDb) });
  });
}

export type {
  OrganizationTenantScope,
  ServiceTenantScope,
  TenantScope,
  TenantScopedCallback,
  TenantScopedHandles,
} from "./tenant-scope.js";
