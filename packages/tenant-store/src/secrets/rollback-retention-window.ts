/**
 * Rollback Retention Window (ADR-0017, ADR-0025, ADR-0076): the configured period that keeps a
 * Retained Published Version eligible for Rollback. Eligibility is evaluated lazily at rollback
 * request time against this window; there is no write-time eligibility stamp, no background
 * expiry job, and expired versions stay as plain rows (retained ciphertext, not crypto-erased).
 */
export const ROLLBACK_RETENTION_WINDOW_DAYS = 90;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Lazily evaluates whether a Retained Published Version published at `publishedAt` is still
 * inside the Rollback Retention Window as of `now`. A version with no recorded `publishedAt`
 * cannot be evaluated and is treated as ineligible (fail closed).
 */
export function isWithinRollbackRetentionWindow(
  publishedAt: Date | null | undefined,
  now: Date = new Date(),
  windowDays: number = ROLLBACK_RETENTION_WINDOW_DAYS,
): boolean {
  if (publishedAt === null || publishedAt === undefined) {
    return false;
  }
  const windowMilliseconds = windowDays * MILLISECONDS_PER_DAY;
  return now.getTime() - publishedAt.getTime() <= windowMilliseconds;
}
