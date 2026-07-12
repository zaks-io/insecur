import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES, STORE_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED, EXIT_UNEXPECTED } from "../src/output/exit-codes.js";

describe("CliError", () => {
  it("preserves error body and exit code", () => {
    const error = new CliError(
      {
        code: AUTH_ERROR_CODES.required,
        message: "Authentication is required.",
        retryable: false,
      },
      EXIT_AUTH_REQUIRED,
    );
    expect(error.exitCode).toBe(EXIT_AUTH_REQUIRED);
    expect(error.toErrorBody().code).toBe("auth.required");
  });

  it("falls back to exitCodeForErrorCode(code, retryable) when no explicit exit code is given", () => {
    // store.unavailable defaults to the retryable exit code (8), but a mid-flight connection loss
    // marks this specific occurrence non-retryable — the CliError must honor that per-occurrence
    // flag instead of always trusting the code's default retryability.
    const retryableError = new CliError({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store is temporarily unavailable.",
      retryable: true,
    });
    expect(retryableError.exitCode).toBe(8);

    const nonRetryableError = new CliError({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store connection was lost mid-flight.",
      retryable: false,
    });
    expect(nonRetryableError.exitCode).toBe(EXIT_UNEXPECTED);
  });
});
