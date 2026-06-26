/**
 * Default non-lease execution claim lifetime for `running` Operations without a Sync Target
 * Serialization lease. Must comfortably exceed the inline execution budget of the request
 * performing the work (ADR-0073).
 */
export const DEFAULT_NON_LEASE_EXECUTION_DEADLINE_SECONDS = 600;

export function computeNonLeaseExecutionDeadline(
  now: Date = new Date(),
  ttlSeconds: number = DEFAULT_NON_LEASE_EXECUTION_DEADLINE_SECONDS,
): string {
  return new Date(now.getTime() + ttlSeconds * 1000).toISOString();
}

export function isIsoTimestampExpired(isoTimestamp: string, now: Date = new Date()): boolean {
  return Date.parse(isoTimestamp) <= now.getTime();
}
