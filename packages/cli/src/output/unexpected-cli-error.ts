import { CLI_ERROR_CODES, type ErrorBody } from "@insecur/domain";

const UNEXPECTED_CLI_FAILURE_MESSAGE = "Unexpected CLI failure" as const;

export function unexpectedCliErrorBody(error: unknown): ErrorBody {
  const errorCategory = error instanceof Error ? "Error" : "UnknownError";
  return {
    code: CLI_ERROR_CODES.unexpectedError,
    message: `${UNEXPECTED_CLI_FAILURE_MESSAGE} (${errorCategory})`,
    retryable: false,
  };
}

/** Verbose mode adds diagnosis context without ever echoing the raw exception. */
export function logUnexpectedCliErrorDebug(error: unknown, verbose: boolean): void {
  if (!verbose) {
    return;
  }
  const errorCategory = error instanceof Error ? "Error" : "UnknownError";
  process.stderr.write(
    `[debug] Unexpected CLI failure (${errorCategory}); raw exception detail suppressed.\n`,
  );
}
