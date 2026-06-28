import {
  INJECTION_ERROR_CODES,
  parseVariableKey,
  secretId,
  type VariableKey,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  computeInjectionGrantExpiresAt,
  INJECTION_GRANT_TTL_SECONDS,
  InjectionGrantError,
  normalizeConsumeSelector,
} from "./index.js";

function variableKey(raw: string): VariableKey {
  const parsed = parseVariableKey(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

describe("computeInjectionGrantExpiresAt", () => {
  it("applies the First Value injection grant TTL", () => {
    const now = new Date("2026-06-28T16:10:00.000Z");

    expect(computeInjectionGrantExpiresAt(now).toISOString()).toBe("2026-06-28T16:15:00.000Z");
    expect(INJECTION_GRANT_TTL_SECONDS).toBe(300);
  });
});

describe("normalizeConsumeSelector", () => {
  it("normalizes exactly one consume selector", () => {
    const appSecret = variableKey("APP_SECRET");
    const existingSecretId = secretId.generate();

    expect(normalizeConsumeSelector({ variableKey: appSecret })).toEqual({
      kind: "variable_key",
      variableKey: appSecret,
    });
    expect(normalizeConsumeSelector({ secretId: existingSecretId })).toEqual({
      kind: "secret_id",
      secretId: existingSecretId,
    });
  });

  it("rejects missing or ambiguous consume selectors with the public grant-denied code", () => {
    const appSecret = variableKey("APP_SECRET");
    const existingSecretId = secretId.generate();

    for (const selector of [{}, { variableKey: appSecret, secretId: existingSecretId }]) {
      expect(() => normalizeConsumeSelector(selector)).toThrow(InjectionGrantError);

      try {
        normalizeConsumeSelector(selector);
      } catch (error) {
        expect(error).toBeInstanceOf(InjectionGrantError);
        expect((error as InjectionGrantError).code).toBe(INJECTION_ERROR_CODES.grantDenied);
      }
    }
  });
});
