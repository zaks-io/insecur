import { CLI_ERROR_CODES } from "@insecur/domain";
import { CommanderError, type Command } from "commander";
import { CliError } from "./cli-error.js";
import { EXIT_VALIDATION } from "./exit-codes.js";

const COMMANDER_USAGE_ERROR_CODES = new Set([
  "commander.unknownCommand",
  "commander.unknownOption",
  "commander.missingMandatoryOptionValue",
  "commander.missingArgument",
  "commander.optionMissingArgument",
  "commander.invalidArgument",
  "commander.conflictingOption",
  "commander.excessArguments",
]);

function normalizeCommanderMessage(message: string): string {
  return message.replace(/^error:\s*/, "");
}

/** Commander default stderr is suppressed; usage errors render through renderEnvelope. */
function suppressCommanderStderr(str: string): void {
  void str;
}

export function applyCommanderUsageSeam(program: Command): void {
  program.configureOutput({ writeErr: suppressCommanderStderr });
  program.exitOverride();
}

export function isCommanderUsageError(error: unknown): error is CommanderError {
  return error instanceof CommanderError && COMMANDER_USAGE_ERROR_CODES.has(error.code);
}

export function commanderUsageCliError(error: CommanderError): CliError {
  return new CliError(
    {
      code: CLI_ERROR_CODES.validationError,
      message: normalizeCommanderMessage(error.message),
      retryable: false,
    },
    EXIT_VALIDATION,
  );
}
