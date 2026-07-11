import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES, STORE_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";

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

  it("derives its exit code from exitCodeForErrorCode(code, retryable) when no exit code is given", () => {
    const retryable = new CliError({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store is temporarily unavailable.",
      retryable: true,
    });
    expect(retryable.exitCode).toBe(8);

    // A mid-flight connection loss surfaces the same code but retryable: false — the exit code
    // must not tell a caller to blindly retry a possibly-committed write.
    const nonRetryable = new CliError({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store is temporarily unavailable.",
      retryable: false,
    });
    expect(nonRetryable.exitCode).toBe(1);
  });

  it("lets an explicit exit code option override the retryable-derived default", () => {
    const error = new CliError(
      {
        code: STORE_ERROR_CODES.unavailable,
        message: "The store is temporarily unavailable.",
        retryable: false,
      },
      8,
    );
    expect(error.exitCode).toBe(8);
  });

  it("preserves the retryable flag on the instance regardless of exit-code derivation", () => {
    const error = new CliError({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store is temporarily unavailable.",
      retryable: false,
    });
    expect(error.retryable).toBe(false);
    expect(error.toErrorBody().retryable).toBe(false);
  });
});
