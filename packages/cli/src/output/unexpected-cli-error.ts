import { CLI_ERROR_CODES, type ErrorBody } from "@insecur/domain";

const UNEXPECTED_CLI_FAILURE_MESSAGE = "Unexpected CLI failure" as const;

export function unexpectedCliErrorBody(error: unknown): ErrorBody {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  return {
    code: CLI_ERROR_CODES.unexpectedError,
    message: `${UNEXPECTED_CLI_FAILURE_MESSAGE} (${errorName})`,
    retryable: false,
  };
}

/** Full error detail is opt-in via --verbose; off by default in run. */
export function logUnexpectedCliErrorDebug(error: unknown, verbose: boolean): void {
  if (!verbose) {
    return;
  }
  if (error instanceof Error) {
    process.stderr.write(`[debug] ${error.name}: ${error.message}\n`);
    if (error.stack !== undefined) {
      process.stderr.write(`${error.stack}\n`);
    }
    return;
  }
  process.stderr.write(`[debug] ${String(error)}\n`);
}
