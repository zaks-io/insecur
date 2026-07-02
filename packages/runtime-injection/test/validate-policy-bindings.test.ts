import { RUNTIME_POLICY_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { RuntimeInjectionPolicyError } from "../src/runtime-injection-policy-error.js";
import { validateRuntimeInjectionPolicyBindings } from "../src/validate-policy-bindings.js";

describe("validateRuntimeInjectionPolicyBindings", () => {
  it("accepts exact secret id bindings", () => {
    const result = validateRuntimeInjectionPolicyBindings({
      secretIds: ["sec_00000000000000000000000001"],
      variableKeys: [],
    });
    expect(result.secretIds).toHaveLength(1);
    expect(result.variableKeys).toHaveLength(0);
  });

  it("accepts exact variable key bindings", () => {
    const result = validateRuntimeInjectionPolicyBindings({
      secretIds: [],
      variableKeys: ["DATABASE_URL"],
    });
    expect(result.variableKeys).toEqual(["DATABASE_URL"]);
  });

  it("rejects empty bindings", () => {
    expect(() =>
      validateRuntimeInjectionPolicyBindings({ secretIds: [], variableKeys: [] }),
    ).toThrow(expect.objectContaining({ code: RUNTIME_POLICY_ERROR_CODES.invalidBindings }));
  });

  it("rejects wildcard secret selection", () => {
    expect(() =>
      validateRuntimeInjectionPolicyBindings({
        secretIds: ["sec_*"],
        variableKeys: [],
      }),
    ).toThrow(expect.objectContaining({ code: RUNTIME_POLICY_ERROR_CODES.patternBindingRejected }));
  });

  it("rejects prefix variable key selection", () => {
    expect(() =>
      validateRuntimeInjectionPolicyBindings({
        secretIds: [],
        variableKeys: ["prefix:DATABASE_"],
      }),
    ).toThrow(expect.objectContaining({ code: RUNTIME_POLICY_ERROR_CODES.patternBindingRejected }));
  });

  it("rejects duplicate secret bindings", () => {
    expect(() =>
      validateRuntimeInjectionPolicyBindings({
        secretIds: ["sec_00000000000000000000000001", "sec_00000000000000000000000001"],
        variableKeys: [],
      }),
    ).toThrow(expect.objectContaining({ code: RUNTIME_POLICY_ERROR_CODES.invalidBindings }));
  });

  it("throws RuntimeInjectionPolicyError for invalid bindings", () => {
    try {
      validateRuntimeInjectionPolicyBindings({ secretIds: ["not-a-secret-id"], variableKeys: [] });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeInjectionPolicyError);
    }
  });
});
