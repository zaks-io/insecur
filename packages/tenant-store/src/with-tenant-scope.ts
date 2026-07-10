import { applyTenantScope } from "./apply-tenant-scope.js";
import { getRuntimeSql } from "./db/connection.js";
import { retryOnceOnConnectionAcquisitionFailure } from "./db/transient-connection-error.js";
import { createTenantScopedTransaction } from "./tenant-scoped-transaction.js";
import { toIsoTimestamp } from "./parse-db-timestamp.js";
import type {
  TenantScope,
  TenantScopedCallback,
  TenantScopedHandles,
  TenantScopeTransactionOptions,
} from "./tenant-scope.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

function transactionOptionsSql(options: TenantScopeTransactionOptions | undefined): string {
  return [
    ...(options?.isolationLevel === "repeatable read" ? ["isolation level repeatable read"] : []),
    ...(options?.readOnly ? ["read only"] : []),
  ].join(" ");
}

async function readTransactionSnapshotAt(sql: TenantScopedSql): Promise<string> {
  const rows = (await sql.unsafe("SELECT transaction_timestamp()::text AS snapshot_at")) as {
    snapshot_at?: Date | string;
  }[];
  const snapshotAt = rows[0]?.snapshot_at;
  if (snapshotAt === undefined) {
    throw new Error("database transaction snapshot timestamp is missing");
  }
  return toIsoTimestamp(snapshotAt);
}

async function runTenantScopedTransaction<TResult>(
  txSql: TenantScopedSql,
  scope: TenantScope,
  callback: TenantScopedCallback<TResult>,
  options: TenantScopeTransactionOptions | undefined,
): Promise<TResult> {
  const snapshotAt = options?.captureSnapshotAt
    ? await readTransactionSnapshotAt(txSql)
    : undefined;
  const { db, sql } = createTenantScopedTransaction(txSql);
  await applyTenantScope(db, scope);
  const handles: TenantScopedHandles = {
    db,
    sql,
    ...(snapshotAt === undefined ? {} : { snapshotAt }),
  };
  return callback(handles);
}

/**
 * The only supported database entry point for tenant-owned metadata.
 * @see docs/adr/0037-tenant-scoped-bound-store-over-rls.md
 */
export async function withTenantScope<TResult>(
  scope: TenantScope,
  callback: TenantScopedCallback<TResult>,
  options?: TenantScopeTransactionOptions,
): Promise<TResult> {
  const sql = getRuntimeSql();
  const transaction = (txSql: TenantScopedSql) =>
    runTenantScopedTransaction(txSql, scope, callback, options);
  const beginOptions = transactionOptionsSql(options);
  // Preview/prod reach Postgres through Hyperdrive, which reports origin pool exhaustion as
  // SQLSTATE 58000 while acquiring the transaction's connection (INS-603). Nothing has executed
  // at that point, so one bounded retry re-enters the pool-wait queue instead of failing the RPC.
  return (await retryOnceOnConnectionAcquisitionFailure(() =>
    beginOptions ? sql.begin(beginOptions, transaction) : sql.begin(transaction),
  )) as TResult;
}

export type {
  OrganizationTenantScope,
  ServiceTenantScope,
  TenantScope,
  TenantScopedCallback,
  TenantScopedHandles,
  TenantScopeTransactionOptions,
} from "./tenant-scope.js";
