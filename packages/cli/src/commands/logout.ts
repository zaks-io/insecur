import { CLI_ERROR_CODES, errorEnvelope, successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { EXIT_UNEXPECTED } from "../output/exit-codes.js";
import { actionableRemediation } from "../output/cli-remediation.js";
import { renderEnvelope, renderSuccess } from "../output/render.js";
import { clearMemorySession, resolveSessionCredential } from "../session/memory-session.js";
import { defaultSessionStore, type SessionStore } from "../session/persisted-session.js";

export interface LogoutCommandOptions {
  readonly sessionStore?: SessionStore;
}

interface RevokeAttemptResult {
  readonly serverRevoked: boolean;
  readonly revokeFailed: boolean;
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

async function attemptRevokeCliSession(
  api: ApiClient,
  host: string,
  credential: string,
): Promise<RevokeAttemptResult> {
  try {
    const revokeResult = await api.revokeCliSession({ host, bearerCredential: credential });
    if (!revokeResult.ok) {
      return { serverRevoked: false, revokeFailed: true };
    }
    const serverRevoked = revokeResult.envelope.data.revoked;
    return { serverRevoked, revokeFailed: false };
  } catch {
    return { serverRevoked: false, revokeFailed: true };
  }
}

function formatLogoutHumanMessage(data: {
  readonly revoked: boolean;
  readonly removed: boolean;
  readonly revokeAttempted: boolean;
  readonly revokeFailed: boolean;
}): string {
  if (!data.revokeAttempted) {
    return data.removed ? "No active session; persisted session removed." : "No active session.";
  }
  if (data.revoked) {
    return data.removed
      ? "Logged out; server session revoked and persisted session removed."
      : "Logged out; server session revoked.";
  }
  if (data.revokeFailed) {
    return "Server revocation could not be confirmed. The local sealed session was retained; retry insecur logout.";
  }
  return data.removed
    ? "Logged out locally; server session was already inactive. Persisted session removed."
    : "Logged out locally; server session was already inactive.";
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

  const revokeAttempt =
    credential === undefined
      ? { serverRevoked: false, revokeFailed: false }
      : await attemptRevokeCliSession(api, host, credential);

  if (revokeAttempt.revokeFailed) {
    renderEnvelope(
      errorEnvelope(
        {
          code: CLI_ERROR_CODES.unexpectedError,
          message:
            "Server revocation could not be confirmed. The local sealed session was retained.",
          retryable: true,
        },
        {
          remediation: actionableRemediation(CLI_ERROR_CODES.unexpectedError, {
            suggestedFix: "Retry insecur logout when the server is reachable.",
            usage: ["insecur", "logout"],
          }),
        },
      ),
      flags,
      () => "",
    );
    return EXIT_UNEXPECTED;
  }

  clearMemorySession();
  const removed = await store.clear();
  const revokeAttempted = credential !== undefined;
  renderSuccess(
    successEnvelope({
      revoked: revokeAttempt.serverRevoked,
      removed,
      revokeAttempted,
      revokeFailed: revokeAttempt.revokeFailed,
    }),
    flags,
    (data) => formatLogoutHumanMessage(data),
  );
  return 0;
}
