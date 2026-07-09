import { CLI_ERROR_CODES, SECRET_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { errorTypeUri } from "../src/output/error-type-uri.js";

describe("errorTypeUri", () => {
  it("maps a dotted+underscored code to a stable hyphenated URI", () => {
    expect(errorTypeUri(CLI_ERROR_CODES.validationError)).toBe(
      "https://insecur.dev/errors/cli-validation-error",
    );
    expect(errorTypeUri(SECRET_ERROR_CODES.inputRequired)).toBe(
      "https://insecur.dev/errors/secret-input-required",
    );
  });

  it("is deterministic — the same code always yields the same URI", () => {
    expect(errorTypeUri(CLI_ERROR_CODES.validationError)).toBe(
      errorTypeUri(CLI_ERROR_CODES.validationError),
    );
  });
});
