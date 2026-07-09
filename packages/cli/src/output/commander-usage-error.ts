import { CLI_ERROR_CODES } from "@insecur/domain";
import { CommanderError, type Command } from "commander";
import { CliError } from "./cli-error.js";
import { actionableRemediation } from "./cli-remediation.js";
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
  // Commander emits multi-line messages ("unknown command 'x'\n(Did you mean y?)");
  // the envelope message is a single line.
  return message
    .replace(/^error:\s*/, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/**
 * Commander's default stderr (a terse line plus the `Usage:` string) is
 * suppressed so usage errors render through the one envelope path. We keep the
 * most recent `Usage:` line it tried to write so the error envelope can hand the
 * caller the exact correct invocation instead of dropping it.
 */
let lastCommanderUsage: string | undefined;

function captureCommanderStderr(str: string): void {
  const usageLine = str
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("Usage:"));
  if (usageLine !== undefined) {
    lastCommanderUsage = usageLine.replace(/^Usage:\s*/, "");
  }
}

export function applyCommanderUsageSeam(program: Command): void {
  program.configureOutput({ writeErr: captureCommanderStderr });
  // Commander appends the `Usage:` line after a usage error; we capture it (see
  // captureCommanderStderr) to hand the caller the exact correct invocation.
  program.showHelpAfterError();
  program.exitOverride();
}

export function isCommanderUsageError(error: unknown): error is CommanderError {
  return error instanceof CommanderError && COMMANDER_USAGE_ERROR_CODES.has(error.code);
}

function usageArgvFromCapture(): readonly string[] | undefined {
  if (lastCommanderUsage === undefined) {
    return undefined;
  }
  const tokens = lastCommanderUsage
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== "[options]");
  return tokens.length > 0 ? tokens : undefined;
}

export function commanderUsageCliError(error: CommanderError): CliError {
  const message = normalizeCommanderMessage(error.message);
  const usage = usageArgvFromCapture();
  return new CliError(
    {
      code: CLI_ERROR_CODES.validationError,
      message,
      retryable: false,
    },
    {
      exitCode: EXIT_VALIDATION,
      remediation: actionableRemediation(CLI_ERROR_CODES.validationError, {
        suggestedFix: `Fix the invocation: ${message}.`,
        ...(usage !== undefined ? { usage } : {}),
      }),
    },
  );
}

/** Test seam: clear the captured usage string between cases. */
export function resetCommanderUsageCapture(): void {
  lastCommanderUsage = undefined;
}
