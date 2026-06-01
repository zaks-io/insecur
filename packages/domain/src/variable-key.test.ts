import { describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "./error-codes.js";
import { parseVariableKey, VARIABLE_KEY_PATTERN } from "./variable-key.js";

describe("VARIABLE_KEY_PATTERN", () => {
  it("documents the V1 env-var-safe format", () => {
    expect(VARIABLE_KEY_PATTERN.source).toBe("^[A-Z_][A-Z0-9_]*$");
  });
});

describe("parseVariableKey", () => {
  it("accepts valid keys", () => {
    expect(parseVariableKey("DATABASE_URL")).toEqual({
      ok: true,
      value: "DATABASE_URL",
    });
    expect(parseVariableKey("A")).toEqual({ ok: true, value: "A" });
    expect(parseVariableKey("_PRIVATE")).toEqual({ ok: true, value: "_PRIVATE" });
  });

  it("rejects invalid keys", () => {
    const cases = ["", "database_url", "1KEY", "KEY-WITH-DASH", "KEY WITH SPACE", "key"] as const;
    for (const raw of cases) {
      expect(parseVariableKey(raw)).toEqual({
        ok: false,
        code: VALIDATION_ERROR_CODES.invalidVariableKey,
      });
    }
  });
});
