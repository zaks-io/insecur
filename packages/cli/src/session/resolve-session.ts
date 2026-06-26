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

async function loadCachedCredentialForHost(host: string): Promise<string | undefined> {
  const session = await readCachedSession();
  if (session === undefined) {
    return undefined;
  }
  if (session.host !== host) {
    await clearCachedSession();
    return undefined;
  }
  return session.credential;
}

export async function resolveSessionCredential(host: string): Promise<string | undefined> {
  const immediate = resolveSessionCredentialFromMemoryOrEnv();
  if (immediate !== undefined) {
    return immediate;
  }
  if (cachedSessionLookup?.host !== host) {
    cachedSessionLookup = {
      host,
      promise: loadCachedCredentialForHost(host),
    };
  }
  return cachedSessionLookup.promise;
}

export function resetSessionCredentialCacheForTests(): void {
  cachedSessionLookup = undefined;
}
