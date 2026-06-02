/** Short-lived Injection Grant lifetime for First Value non-protected development runs. */
export const INJECTION_GRANT_TTL_SECONDS = 300;

export function computeInjectionGrantExpiresAt(issuedAt: Date = new Date()): Date {
  return new Date(issuedAt.getTime() + INJECTION_GRANT_TTL_SECONDS * 1000);
}
