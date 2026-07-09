import { CLI_ERROR_CODES, errorEnvelope } from "@insecur/domain";
import type { RenderFlags } from "../program-deps.js";
import { CliError } from "./cli-error.js";
import { actionableRemediation } from "./cli-remediation.js";
import { EXIT_UNEXPECTED } from "./exit-codes.js";
import { commanderUsageCliError, isCommanderUsageError } from "./commander-usage-error.js";
import { renderEnvelope } from "./render.js";
import { logUnexpectedCliErrorDebug, unexpectedCliErrorBody } from "./unexpected-cli-error.js";
import { CommanderError } from "commander";

export function renderCliRunFailure(error: unknown, flags: RenderFlags): number {
  if (isCommanderUsageError(error)) {
    const cliError = commanderUsageCliError(error);
    renderEnvelope(cliError.toErrorEnvelope(), flags, () => "");
    return cliError.exitCode;
  }
  if (error instanceof CommanderError && error.exitCode === 0) {
    return 0;
  }
  if (error instanceof CliError) {
    const envelope =
      error.data === undefined
        ? error.toErrorEnvelope()
        : { ...error.toErrorEnvelope(), data: error.data };
    renderEnvelope(envelope, flags, () => "");
    return error.exitCode;
  }
  logUnexpectedCliErrorDebug(error, flags.verbose);
  renderEnvelope(
    errorEnvelope(unexpectedCliErrorBody(error), {
      remediation: actionableRemediation(CLI_ERROR_CODES.unexpectedError, {
        suggestedFix: flags.verbose
          ? "This is a CLI bug; the full error detail is printed above. Report it."
          : "Re-run the same command with --verbose to print the full error detail.",
      }),
    }),
    flags,
    () => "",
  );
  return EXIT_UNEXPECTED;
}
