/** Short-lived Injection Grant lifetime for First Value non-protected development runs. */
export const INJECTION_GRANT_TTL_SECONDS = 300;

export function computeInjectionGrantExpiresAt(now = new Date()): Date {
  return computeInjectionGrantExpiresAtFromTtl(INJECTION_GRANT_TTL_SECONDS, now);
}

export function computeInjectionGrantExpiresAtFromTtl(ttlSeconds: number, now = new Date()): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}
