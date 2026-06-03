import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES } from "@insecur/domain";
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
});
