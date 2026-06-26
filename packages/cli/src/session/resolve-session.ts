import { getMemorySession } from "./memory-session.js";
import { readCachedSession } from "./session-cache.js";

let cachedSessionPromise: Promise<string | undefined> | undefined;

function readSessionFromEnv(): string | undefined {
  const value = process.env.INSECUR_SESSION_TOKEN;
  return value === "" ? undefined : value;
}

export function resolveSessionCredentialFromMemoryOrEnv(): string | undefined {
  return getMemorySession()?.credential ?? readSessionFromEnv();
}

export async function resolveSessionCredential(): Promise<string | undefined> {
  const immediate = resolveSessionCredentialFromMemoryOrEnv();
  if (immediate !== undefined) {
    return immediate;
  }
  cachedSessionPromise ??= readCachedSession().then((session) => session?.credential);
  return cachedSessionPromise;
}

export function resetSessionCredentialCacheForTests(): void {
  cachedSessionPromise = undefined;
}
