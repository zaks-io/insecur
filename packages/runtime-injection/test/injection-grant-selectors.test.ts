import { INJECTION_ERROR_CODES, secretId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { InjectionGrantError } from "../src/injection-grant-error.js";
import {
  assertSingleIssueSelectorCount,
  normalizeConsumeSelector,
} from "../src/injection-grant-selectors.js";

describe("normalizeConsumeSelector", () => {
  it("requires exactly one of variableKey or secretId", () => {
    expect(() => normalizeConsumeSelector({})).toThrow(
      "exactly one of variableKey or secretId is required to consume",
    );
    expect(() =>
      normalizeConsumeSelector({
        variableKey: "API_KEY",
        secretId: secretId.generate(),
      }),
    ).toThrow("exactly one of variableKey or secretId is required to consume");
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
  it("rejects issue when more than one secret binding is requested", () => {
    expect(() => assertSingleIssueSelectorCount(2)).toThrow(InjectionGrantError);
    expect(() => assertSingleIssueSelectorCount(2)).toThrow(
      expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }),
    );
  });

  it("allows exactly one secret binding", () => {
    expect(() => assertSingleIssueSelectorCount(1)).not.toThrow();
  });
});
