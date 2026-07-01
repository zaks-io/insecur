import { applyTenantScope } from "./apply-tenant-scope.js";
import { getRuntimeSql } from "./db/connection.js";
import { createTenantScopedTransaction } from "./tenant-scoped-transaction.js";
import type { TenantScope, TenantScopedCallback } from "./tenant-scope.js";

/**
 * The only supported database entry point for tenant-owned metadata.
 * @see docs/adr/0037-tenant-scoped-bound-store-over-rls.md
 */
export async function withTenantScope<TResult>(
  scope: TenantScope,
  callback: TenantScopedCallback<TResult>,
): Promise<TResult> {
  const sql = getRuntimeSql();
  return (await sql.begin(async (txSql): Promise<TResult> => {
    const { db, sql: scopedSql } = createTenantScopedTransaction(txSql);
    await applyTenantScope(db, scope);
    return callback({ db, sql: scopedSql });
  })) as TResult;
}

export type {
  OrganizationTenantScope,
  ServiceTenantScope,
  TenantScope,
  TenantScopedCallback,
  TenantScopedHandles,
} from "./tenant-scope.js";
