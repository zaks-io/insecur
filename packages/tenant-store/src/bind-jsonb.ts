import type { TenantScopedSql } from "./tenant-scoped-sql.js";

const JSONB_OID = 3802;

/**
 * Bind a JSON-serializable value for jsonb columns inside tenant-scoped transactions.
 * Drizzle's postgres-js driver registers a transparent jsonb serializer, which
 * breaks postgres.js `sql.json()` by passing raw objects to the bind layer.
 */
export function bindJsonb(
  sql: TenantScopedSql,
  value: unknown,
): ReturnType<TenantScopedSql["typed"]> {
  return sql.typed(JSON.stringify(value), JSONB_OID);
}
