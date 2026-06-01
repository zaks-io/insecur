import { getRuntimeSql } from "./db/connection.js";
import { applyTenantScope } from "./apply-tenant-scope.js";
import type { TenantScope, TenantScopedCallback } from "./tenant-scope.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/**
 * The only supported database entry point for tenant-owned metadata.
 * @see docs/adr/0037-tenant-scoped-bound-store-over-rls.md
 */
export async function withTenantScope<TResult>(
  scope: TenantScope,
  callback: TenantScopedCallback<TResult>,
): Promise<TResult> {
  const sql = getRuntimeSql();
  return (await sql.begin(async (tx) => {
    const scoped = tx as TenantScopedSql;
    await applyTenantScope(scoped, scope);
    return callback(scoped);
  })) as TResult;
}

export type {
  OrganizationTenantScope,
  ServiceTenantScope,
  TenantScope,
  TenantScopedCallback,
} from "./tenant-scope.js";
