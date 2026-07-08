import { resolveSessionCredential } from "../session/memory-session.js";
import { resolveAgentCredentialFromEnv } from "./agent-credential-store.js";
import { defaultSessionStore } from "../session/persisted-session.js";
import type { SessionStore } from "../session/persisted-session.js";

/**
 * Resolves a session credential when present without failing.
 * Mirrors `requireSessionCredential` precedence but returns `undefined` when absent.
 */
export async function tryResolveSessionCredential(
  host: string,
  store?: SessionStore,
): Promise<string | undefined> {
  const fromMemoryOrEnv = resolveSessionCredential();
  if (fromMemoryOrEnv !== undefined) {
    return fromMemoryOrEnv;
  }
  const fromAgentFile = await resolveAgentCredentialFromEnv(host);
  if (fromAgentFile !== undefined) {
    return fromAgentFile;
  }
  return (await (store ?? defaultSessionStore()).load(host))?.credential;
}
