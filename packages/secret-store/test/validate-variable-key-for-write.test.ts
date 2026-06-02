import { VALIDATION_ERROR_CODES, type VariableKey } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { SecretWriteError } from "../src/secret-write-error.js";
import { validateVariableKeyForWrite } from "../src/validate-variable-key-for-write.js";

describe("validateVariableKeyForWrite", () => {
  it("accepts valid Variable Keys", () => {
    expect(validateVariableKeyForWrite("API_KEY" as VariableKey)).toBe("API_KEY");
  });

  it("rejects invalid Variable Keys", () => {
    expect(() => validateVariableKeyForWrite("invalid-key" as VariableKey)).toThrow(
      SecretWriteError,
    );
    try {
      validateVariableKeyForWrite("invalid-key" as VariableKey);
    } catch (error) {
      expect(error).toMatchObject({ code: VALIDATION_ERROR_CODES.invalidVariableKey });
    }
  });
});
