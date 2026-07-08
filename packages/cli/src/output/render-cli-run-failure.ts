import { errorEnvelope } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { CliError } from "./cli-error.js";
import { EXIT_UNEXPECTED } from "./exit-codes.js";
import { commanderUsageCliError, isCommanderUsageError } from "./commander-usage-error.js";
import { renderEnvelope } from "./render.js";
import { logUnexpectedCliErrorDebug, unexpectedCliErrorBody } from "./unexpected-cli-error.js";
import { CommanderError } from "commander";

export function renderCliRunFailure(error: unknown, flags: GlobalCliFlags): number {
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
  renderEnvelope(errorEnvelope(unexpectedCliErrorBody(error)), flags, () => "");
  return EXIT_UNEXPECTED;
}
