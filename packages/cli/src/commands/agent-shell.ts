import { CLI_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { ApiClient } from "../api/types.js";
import { spawnCommand } from "./run-child.js";
import {
  buildAgentMarkedChildEnv,
  deriveAgentSessionFromHuman,
  requireHumanSessionCredential,
  resolveAgentTag,
} from "./agent-shared.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";

function assertAgentShellJsonCompatible(flags: GlobalCliFlags): void {
  if (flags.json) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.validationError,
        message: "insecur agent shell cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

export async function runAgentShellCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  command: readonly string[],
): Promise<number> {
  assertAgentShellJsonCompatible(flags);
  if (command.length === 0) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.validationError,
        message: "insecur agent shell requires a command after --.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const humanCredential = await requireHumanSessionCredential(context.scope.host);
  const derived = await deriveAgentSessionFromHuman(api, context.scope.host, humanCredential);
  const agentTag = resolveAgentTag(flags);
  const childEnv = buildAgentMarkedChildEnv({
    credential: derived.credential,
    host: context.scope.host,
    ...(agentTag === undefined ? {} : { agentTag }),
  });
  return spawnCommand(command, childEnv);
}
