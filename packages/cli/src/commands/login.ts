import { successEnvelope, type ResolvedTargetEcho } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";
import { setMemorySession } from "../session/memory-session.js";
import { runBrowserPkceLogin } from "./login-pkce.js";
import { runManagedLoginShell } from "./login-shell.js";

export interface LoginCommandOptions {
  readonly shell: boolean;
  readonly openBrowser: boolean;
  readonly callbackPort?: number;
}

async function exchangeLoginSession(
  flags: GlobalCliFlags,
  api: ApiClient,
  host: string,
  commandOptions: LoginCommandOptions,
) {
  return runBrowserPkceLogin({
    flags,
    api,
    host,
    options: {
      openBrowser: commandOptions.openBrowser,
      ...(commandOptions.callbackPort === undefined
        ? {}
        : { callbackPort: commandOptions.callbackPort }),
    },
  });
}

interface MemoryLoginResult {
  readonly flags: GlobalCliFlags;
  readonly host: string;
  readonly credential: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly requestId: Parameters<typeof buildEnvelopeMeta>[0]["requestId"];
}

function completeMemoryLogin(result: MemoryLoginResult): void {
  setMemorySession({
    credential: result.credential,
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
  });
  const resolvedTargets: ResolvedTargetEcho[] = [
    { type: "session", id: asEchoId(result.sessionId) },
  ];
  renderSuccess(
    successEnvelope(
      { sessionId: result.sessionId, expiresAt: result.expiresAt, host: result.host },
      buildEnvelopeMeta({ requestId: result.requestId, resolvedTargets }),
    ),
    result.flags,
    () => `Logged in (session ${result.sessionId}, expires ${result.expiresAt}).`,
  );
}

export async function runLoginCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: LoginCommandOptions,
): Promise<number> {
  const { host } = context.scope;
  const exchanged = await exchangeLoginSession(flags, api, host, commandOptions);
  if (!exchanged.ok) {
    throw new CliError(exchanged.envelope.error);
  }
  const { sessionId, expiresAt } = exchanged.envelope.data;
  if (commandOptions.shell) {
    return runManagedLoginShell({
      flags,
      credential: exchanged.credential,
      host,
      sessionId,
      expiresAt,
    });
  }
  completeMemoryLogin({
    flags,
    host,
    credential: exchanged.credential,
    sessionId,
    expiresAt,
    requestId: exchanged.envelope.meta?.requestId,
  });
  return 0;
}
