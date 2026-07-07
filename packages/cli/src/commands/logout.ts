import { successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { renderSuccess } from "../output/render.js";
import { clearMemorySession, resolveSessionCredential } from "../session/memory-session.js";
import { defaultSessionStore, type SessionStore } from "../session/persisted-session.js";

export interface LogoutCommandOptions {
  readonly sessionStore?: SessionStore;
}

async function tryResolveCredential(
  host: string,
  store: SessionStore,
): Promise<string | undefined> {
  const memory = resolveSessionCredential();
  if (memory !== undefined) {
    return memory;
  }
  return (await store.load(host))?.credential;
}

export async function runLogoutCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: LogoutCommandOptions = {},
): Promise<number> {
  const store = options.sessionStore ?? defaultSessionStore();
  const { host } = context.scope;
  const credential = await tryResolveCredential(host, store);

  if (credential !== undefined) {
    await api.revokeCliSession({ host, bearerCredential: credential });
  }

  clearMemorySession();
  const removed = await store.clear();
  renderSuccess(successEnvelope({ revoked: credential !== undefined, removed }), flags, (data) => {
    if (data.revoked) {
      return data.removed
        ? "Logged out; server session revoked and persisted session removed."
        : "Logged out; server session revoked.";
    }
    return data.removed ? "No active session; persisted session removed." : "No active session.";
  });
  return 0;
}
