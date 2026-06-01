import type { Sql, TransactionSql } from "postgres";

/**
 * Transaction-bound tagged SQL available only inside `withTenantScope`.
 * The underlying pool is not exported (ADR-0037).
 */
export type TenantScopedSql = Sql | TransactionSql;
