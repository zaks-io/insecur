/** Idempotency key for a scheduled backup export run (ADR-0066 / ADR-0072). */
export function buildBackupExportIdempotencyKey(scheduledAt: Date): string {
  return `backup.export:${scheduledAt.toISOString()}`;
}
