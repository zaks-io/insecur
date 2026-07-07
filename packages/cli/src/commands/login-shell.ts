import { CLI_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";
import { buildLoginShellChildEnv } from "./shell-env.js";
import { resolveInteractiveShell, runInteractiveShell } from "./managed-shell.js";

export interface ManagedLoginShellInput {
  readonly flags: GlobalCliFlags;
  readonly credential: string;
  readonly host: string;
  readonly sessionId: string;
  readonly expiresAt: string;
}

function assertLoginShellCompatible(flags: GlobalCliFlags): void {
  if (flags.json) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.validationError,
        message: "insecur login --shell cannot be combined with --json.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
}

export function runManagedLoginShell(input: ManagedLoginShellInput): Promise<number> {
  assertLoginShellCompatible(input.flags);
  if (!input.flags.quiet) {
    process.stderr.write(
      `Starting authenticated shell (session ${input.sessionId}, expires ${input.expiresAt}).\n`,
    );
  }
  return runInteractiveShell(
    resolveInteractiveShell(),
    buildLoginShellChildEnv(input.credential, input.host),
  );
}
