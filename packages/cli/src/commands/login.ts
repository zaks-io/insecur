import { AUTH_ERROR_CODES, successEnvelope, type ResolvedTargetEcho } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { resolveCliScope } from "../config/resolve-scope.js";
import { loadProjectConfig } from "../config/project-config.js";
import { loadUserConfig } from "../config/user-config.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";
import { setMemorySession } from "../session/memory-session.js";

export interface LoginCommandOptions {
  readonly cookieEnv: string;
  readonly csrfEnv: string;
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

export async function runLoginCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  commandOptions: LoginCommandOptions,
): Promise<number> {
  const scope = resolveCliScope(
    flags,
    await loadProjectConfig(flags.configDir),
    await loadUserConfig(),
  );
  const cookieHeader = readCookieHeader(commandOptions.cookieEnv);
  const csrfHeader = process.env[commandOptions.csrfEnv];
  const exchanged = await api.exchangeCliSession({
    host: scope.host,
    cookieHeader,
    ...(csrfHeader === undefined || csrfHeader === "" ? {} : { csrfHeader }),
  });
  if (!exchanged.ok) {
    throw new CliError(exchanged.envelope.error);
  }
  const { sessionId, expiresAt } = exchanged.envelope.data;
  setMemorySession({
    credential: exchanged.credential,
    sessionId,
    expiresAt,
  });
  const resolvedTargets: ResolvedTargetEcho[] = [
    {
      type: "session",
      id: asEchoId(sessionId),
    },
  ];
  const output = successEnvelope(
    { sessionId, expiresAt, host: scope.host },
    buildEnvelopeMeta({
      requestId: exchanged.envelope.meta?.requestId,
      resolvedTargets,
    }),
  );
  renderSuccess(output, flags, () => `Logged in (session ${sessionId}, expires ${expiresAt}).`);
  return 0;
}
