import { clearMemorySession, getMemorySession } from "./memory-session.js";

function readSessionFromEnv(): string | undefined {
  const value = process.env.INSECUR_SESSION_TOKEN;
  return value === "" ? undefined : value;
}

export function resolveSessionCredentialFromMemoryOrEnv(): string | undefined {
  return getMemorySession()?.credential ?? readSessionFromEnv();
}

export function invalidateSessionCredentialLookup(): void {
  // Reserved for tests and future in-process dedupe; no durable lookup state today.
}

/** Test alias for lookup invalidation; production code should prefer {@link clearSessionCredentialHandoff}. */
export const resetSessionCredentialCacheForTests = invalidateSessionCredentialLookup;

export function clearSessionCredentialHandoff(): void {
  invalidateSessionCredentialLookup();
  clearMemorySession();
}

export function resolveSessionCredential(): string | undefined {
  return resolveSessionCredentialFromMemoryOrEnv();
}
