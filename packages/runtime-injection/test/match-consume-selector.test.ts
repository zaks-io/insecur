import { INJECTION_ERROR_CODES, secretId, secretVersionId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { InjectionGrantError } from "../src/injection-grant-error.js";
import { matchConsumeSelectorToBinding } from "../src/match-consume-selector.js";

const bound = {
  secretId: secretId.brand("sec_00000000000000000000000001"),
  secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
  variableKey: "API_KEY" as const,
};

describe("matchConsumeSelectorToBinding", () => {
  it("accepts a matching variable key selector", () => {
    expect(
      matchConsumeSelectorToBinding({ kind: "variable_key", variableKey: "API_KEY" }, bound),
    ).toEqual({
      secretId: bound.secretId,
      variableKey: bound.variableKey,
    });
  });

  it("accepts a matching secret id selector", () => {
    expect(
      matchConsumeSelectorToBinding({ kind: "secret_id", secretId: bound.secretId }, bound),
    ).toEqual({
      secretId: bound.secretId,
      variableKey: bound.variableKey,
    });
  });

  it("denies a variable key selector that does not match the grant binding", () => {
    expect(() =>
      matchConsumeSelectorToBinding({ kind: "variable_key", variableKey: "OTHER_KEY" }, bound),
    ).toThrow(InjectionGrantError);
    expect(() =>
      matchConsumeSelectorToBinding({ kind: "variable_key", variableKey: "OTHER_KEY" }, bound),
    ).toThrow(expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }));
  });

  it("denies a secret id selector that does not match the grant binding", () => {
    const otherSecretId = secretId.generate();
    expect(() =>
      matchConsumeSelectorToBinding({ kind: "secret_id", secretId: otherSecretId }, bound),
    ).toThrow(InjectionGrantError);
    expect(() =>
      matchConsumeSelectorToBinding({ kind: "secret_id", secretId: otherSecretId }, bound),
    ).toThrow(expect.objectContaining({ code: INJECTION_ERROR_CODES.grantDenied }));
  });
});
