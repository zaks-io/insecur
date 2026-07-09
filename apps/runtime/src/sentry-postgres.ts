import * as Sentry from "@sentry/cloudflare";

/** Add query spans only when the enclosing Sentry transaction is sampled. */
export function instrumentRuntimeSql<T>(sql: T): T {
  return Sentry.instrumentPostgresJsSql(sql, { requireParentSpan: true });
}
