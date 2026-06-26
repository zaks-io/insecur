import { getMemorySession } from "./memory-session.js";
import { clearCachedSession, readCachedSession } from "./session-cache.js";

interface CachedSessionLookup {
  readonly host: string;
  readonly promise: Promise<string | undefined>;
}

let cachedSessionLookup: CachedSessionLookup | undefined;

function readSessionFromEnv(): string | undefined {
  const value = process.env.INSECUR_SESSION_TOKEN;
  return value === "" ? undefined : value;
}

export function resolveSessionCredentialFromMemoryOrEnv(): string | undefined {
  return getMemorySession()?.credential ?? readSessionFromEnv();
}

export function invalidateSessionCredentialLookup(): void {
  cachedSessionLookup = undefined;
}

/** Test alias for lookup invalidation; production code should prefer {@link clearSessionCredentialHandoff}. */
export const resetSessionCredentialCacheForTests = invalidateSessionCredentialLookup;

export async function clearSessionCredentialHandoff(): Promise<void> {
  invalidateSessionCredentialLookup();
  await clearCachedSession();
}

async function loadCachedCredentialForHost(host: string): Promise<string | undefined> {
  const session = await readCachedSession();
  if (session === undefined) {
    return undefined;
  }
  if (session.host !== host) {
    await clearSessionCredentialHandoff();
    return undefined;
  }
  return session.credential;
}

export async function resolveSessionCredential(host: string): Promise<string | undefined> {
  const immediate = resolveSessionCredentialFromMemoryOrEnv();
  if (immediate !== undefined) {
    return immediate;
  }
  if (cachedSessionLookup?.host === host) {
    return cachedSessionLookup.promise;
  }
  const promise = loadCachedCredentialForHost(host).finally(() => {
    if (cachedSessionLookup?.promise === promise) {
      cachedSessionLookup = undefined;
    }
  });
  cachedSessionLookup = { host, promise };
  return promise;
}
