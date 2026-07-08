import { isMetadataSafeOpaqueTokenString } from "@insecur/domain";

/** Encodes a cron schedule instant as a metadata-safe opaque token segment (no `:`). */
function encodeScheduledTimestamp(scheduledAt: Date): string {
  return scheduledAt.toISOString().replaceAll(":", ".");
}

/** Idempotency key for a scheduled backup export run (ADR-0066 / ADR-0072). */
export function buildBackupExportIdempotencyKey(scheduledAt: Date): string {
  const key = `backup.export.${encodeScheduledTimestamp(scheduledAt)}`;
  if (!isMetadataSafeOpaqueTokenString(key)) {
    throw new Error("backup export idempotency key must be a metadata-safe opaque token");
  }
  return key;
}

/** Transition idempotency keys for backup.export state changes within one scheduled run. */
export function buildBackupExportTransitionIdempotencyKey(
  scheduledAt: Date,
  phase: "running" | "succeeded" | "failed",
): string {
  return `${buildBackupExportIdempotencyKey(scheduledAt)}.${phase}`;
}
