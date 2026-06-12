import type { TenantScopedSql } from "@insecur/tenant-store";
import type { OperationProgress } from "./operation-types.js";

const JSONB_OID = 3802;

function progressToPlainJson(progress: OperationProgress): OperationProgress {
  return JSON.parse(JSON.stringify(progress)) as OperationProgress;
}

/**
 * Bind operation progress for jsonb columns inside tenant-scoped transactions.
 * Drizzle's postgres-js driver registers a transparent jsonb serializer, which
 * breaks postgres.js `sql.json()` by passing raw objects to the bind layer.
 */
export function bindOperationProgressJsonb(
  sql: TenantScopedSql,
  progress: OperationProgress,
): ReturnType<TenantScopedSql["typed"]> {
  return sql.typed(JSON.stringify(progressToPlainJson(progress)), JSONB_OID);
}
