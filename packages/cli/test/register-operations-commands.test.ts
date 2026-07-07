import { describe, expect, it } from "vitest";
import { parseOperationsWaitTimeout } from "../src/register-operations-commands.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { CliError } from "../src/output/cli-error.js";

describe("parseOperationsWaitTimeout", () => {
  it.each(["1", "60", "600", "999999"])("accepts valid timeout %s", (value) => {
    expect(parseOperationsWaitTimeout(value)).toBe(Number(value));
  });

  it("preserves an omitted timeout", () => {
    expect(parseOperationsWaitTimeout(undefined)).toBeUndefined();
  });

  it.each(["0", "-1", "5m", "abc", "60abc", "1.5", ""])("rejects invalid timeout %s", (value) => {
    expect(() => parseOperationsWaitTimeout(value)).toThrow(/--timeout/);
  });

  it("fails closed at exit 2 for invalid timeout", () => {
    try {
      parseOperationsWaitTimeout("5m");
      expect.fail("expected CliError");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(EXIT_VALIDATION);
    }
  });
});
