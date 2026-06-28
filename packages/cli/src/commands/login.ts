import { AUTH_ERROR_CODES, successEnvelope, type ResolvedTargetEcho } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";
import { setMemorySession } from "../session/memory-session.js";
import { runManagedLoginShell } from "./login-shell.js";

export interface LoginCommandOptions {
  readonly cookieEnv: string;
  readonly csrfEnv: string;
  readonly shell: boolean;
}

function readCookieHeader(cookieEnv: string): string {
  const cookieHeader = process.env[cookieEnv];
  if (cookieHeader === undefined || cookieHeader === "") {
    throw new CliError(
      {
        code: AUTH_ERROR_CODES.required,
        message: `Set ${cookieEnv} to the WorkOS browser Cookie header for CLI exchange.`,
        retryable: false,
      },
      EXIT_AUTH_REQUIRED,
    );
  }
  return cookieHeader;
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
  const cookieHeader = readCookieHeader(commandOptions.cookieEnv);
  const csrfHeader = process.env[commandOptions.csrfEnv];
  const exchanged = await api.exchangeCliSession({
    host,
    cookieHeader,
    ...(csrfHeader === undefined || csrfHeader === "" ? {} : { csrfHeader }),
  });
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
