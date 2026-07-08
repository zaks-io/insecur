import { isMetadataSafeOpaqueTokenString } from "@insecur/domain";

/** Encodes a cron schedule instant as a metadata-safe opaque token segment (no `:`). */
function encodeScheduledTimestamp(scheduledAt: Date): string {
  return scheduledAt.toISOString().replaceAll(":", ".");
}

/**
 * Idempotency key for a scheduled backup export run (ADR-0066 / ADR-0072).
 *
 * Derived purely from the cron schedule instant, so a duplicate cron redelivery of the
 * same scheduled run resolves to the same key (idempotent replay) while a distinct run
 * gets a distinct key (a new Operation). The same key is used for the create and for every
 * lifecycle transition of that run: the Operation store distinguishes which transition has
 * already been applied by the target state, not by varying the mutation idempotency key
 * (reusing a stable key with a different one throws idempotencyMismatch).
 */
export function buildBackupExportIdempotencyKey(scheduledAt: Date): string {
  const key = `backup.export.${encodeScheduledTimestamp(scheduledAt)}`;
  if (!isMetadataSafeOpaqueTokenString(key)) {
    throw new Error("backup export idempotency key must be a metadata-safe opaque token");
  }
  return key;
}
