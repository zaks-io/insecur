import {
  AUTH_ERROR_CODES,
  successEnvelope,
  VALIDATION_ERROR_CODES,
  type ResolvedTargetEcho,
} from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_AUTH_REQUIRED, EXIT_VALIDATION } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";
import type { MemorySession } from "../session/memory-session.js";
import { setMemorySession } from "../session/memory-session.js";
import { buildSessionShellExport } from "../session/shell-export.js";

export interface LoginCommandOptions {
  readonly cookieEnv: string;
  readonly csrfEnv: string;
  readonly printExport?: boolean;
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

function assertLoginOutputMode(flags: GlobalCliFlags, printExport: boolean | undefined): void {
  if (printExport === true && flags.json) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "insecur login --print-export cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

function renderLoginShellExport(
  session: MemorySession,
  host: string,
  flags: GlobalCliFlags,
): number {
  process.stdout.write(`${buildSessionShellExport(session.credential, host)}\n`);
  if (!flags.quiet) {
    process.stderr.write(
      `Logged in (session ${session.sessionId}, expires ${session.expiresAt}).\n`,
    );
    process.stderr.write(
      "Credential exported for this shell only; eval this output or use insecur shell.\n",
    );
  }
  return 0;
}

export async function runLoginCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: LoginCommandOptions,
): Promise<number> {
  assertLoginOutputMode(flags, commandOptions.printExport);
  const { host } = context.scope;
  const csrfHeader = process.env[commandOptions.csrfEnv];
  const exchanged = await api.exchangeCliSession({
    host,
    cookieHeader: readCookieHeader(commandOptions.cookieEnv),
    ...(csrfHeader === undefined || csrfHeader === "" ? {} : { csrfHeader }),
  });
  if (!exchanged.ok) {
    throw new CliError(exchanged.envelope.error);
  }
  const { sessionId, expiresAt } = exchanged.envelope.data;
  const session = { credential: exchanged.credential, sessionId, expiresAt };
  setMemorySession(session);
  if (commandOptions.printExport === true) {
    return renderLoginShellExport(session, host, flags);
  }
  const resolvedTargets: ResolvedTargetEcho[] = [{ type: "session", id: asEchoId(sessionId) }];
  const output = successEnvelope(
    { sessionId, expiresAt, host },
    buildEnvelopeMeta({
      requestId: exchanged.envelope.meta?.requestId,
      resolvedTargets,
    }),
  );
  renderSuccess(output, flags, () => `Logged in (session ${sessionId}, expires ${expiresAt}).`);
  return 0;
}
