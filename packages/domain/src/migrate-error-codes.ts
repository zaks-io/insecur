/** Local Mode → cloud migrate reconcile failures (ADR-0080). */
export const MIGRATE_ERROR_CODES = {
  /** A remote value diverges from the local candidate; nothing written, nothing deleted. */
  remoteDiverged: "migrate.remote_diverged",
} as const;

export type MigrateErrorCode = (typeof MIGRATE_ERROR_CODES)[keyof typeof MIGRATE_ERROR_CODES];
