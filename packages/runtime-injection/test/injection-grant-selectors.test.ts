import { INJECTION_ERROR_CODES, secretId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { InjectionGrantError } from "../src/injection-grant-error.js";
import {
  assertSingleIssueSelectorCount,
  issueSelectorBindingCount,
  normalizeConsumeSelector,
} from "../src/injection-grant-selectors.js";

describe("normalizeConsumeSelector", () => {
  it("requires exactly one of variableKey or secretId", () => {
    expect(() => normalizeConsumeSelector({})).toThrow(InjectionGrantError);
    expect(() => normalizeConsumeSelector({})).toThrow(
      expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }),
    );
    expect(() =>
      normalizeConsumeSelector({
        variableKey: "API_KEY",
        secretId: secretId.generate(),
      }),
    ).toThrow(InjectionGrantError);
    expect(() =>
      normalizeConsumeSelector({
        variableKey: "API_KEY",
        secretId: secretId.generate(),
      }),
    ).toThrow(expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }));
  });

  it("normalizes variable key and secret id selectors", () => {
    const id = secretId.generate();
    expect(normalizeConsumeSelector({ variableKey: "API_KEY" })).toEqual({
      kind: "variable_key",
      variableKey: "API_KEY",
    });
    expect(normalizeConsumeSelector({ secretId: id })).toEqual({
      kind: "secret_id",
      secretId: id,
    });
  });
});

describe("injection grant selector rules", () => {
  it("rejects issue when selector has no secret binding", () => {
    expect(issueSelectorBindingCount({ kind: "variable_key", variableKey: "" })).toBe(0);
    expect(() => assertSingleIssueSelectorCount({ kind: "variable_key", variableKey: "" })).toThrow(
      InjectionGrantError,
    );
    expect(() => assertSingleIssueSelectorCount({ kind: "variable_key", variableKey: "" })).toThrow(
      expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }),
    );
  });

  it("allows exactly one secret binding", () => {
    expect(() =>
      assertSingleIssueSelectorCount({ kind: "variable_key", variableKey: "API_KEY" }),
    ).not.toThrow();
    const id = secretId.generate();
    expect(issueSelectorBindingCount({ kind: "secret_id", secretId: id })).toBe(1);
    expect(() => assertSingleIssueSelectorCount({ kind: "secret_id", secretId: id })).not.toThrow();
  });
});
