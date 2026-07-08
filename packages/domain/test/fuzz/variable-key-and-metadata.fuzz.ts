import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VALIDATION_ERROR_CODES } from "../../src/error-codes.js";
import { DEFAULT_FORBIDDEN_KEYS, findMetadataSafetyViolations } from "../../src/metadata-safety.js";
import { parseVariableKey, VARIABLE_KEY_PATTERN } from "../../src/variable-key.js";

function isForbiddenMetadataKeyViolation(violation: string): boolean {
  return violation.includes("forbidden metadata key");
}

describe("variable key fuzz", () => {
  it("matches the documented V1 env-var-safe pattern exactly", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 128 }), (raw) => {
        const parsed = parseVariableKey(raw);

        if (VARIABLE_KEY_PATTERN.test(raw)) {
          expect(parsed).toEqual({ ok: true, value: raw });
          return;
        }

        expect(parsed).toEqual({
          ok: false,
          code: VALIDATION_ERROR_CODES.invalidVariableKey,
        });
      }),
      { examples: [[""], ["A"], ["_"], ["DATABASE_URL"], ["database_url"], ["API-KEY"]] },
    );
  });
});

describe("metadata safety fuzz", () => {
  it("rejects forbidden metadata keys at any generated value shape", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DEFAULT_FORBIDDEN_KEYS), fc.jsonValue(), (key, value) => {
        const violations = findMetadataSafetyViolations({ [key]: value });

        expect(violations.some(isForbiddenMetadataKeyViolation)).toBe(true);
      }),
      {
        examples: [
          ["secret", "value"],
          ["token", { nested: true }],
          ["private_key", ["-----BEGIN PRIVATE KEY-----"]],
        ],
      },
    );
  });
});
