import { INJECTION_ERROR_CODES, type SecretId, type VariableKey } from "@insecur/domain";
import type { ResolvedInjectionGrantBinding } from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { InjectionGrantConsumeSelector } from "./injection-grant-selectors.js";

export function matchConsumeSelectorToBinding(
  selector: InjectionGrantConsumeSelector,
  bound: ResolvedInjectionGrantBinding,
): { secretId: SecretId; variableKey: VariableKey } {
  if (selector.kind === "variable_key") {
    if (selector.variableKey !== bound.variableKey) {
      throw new InjectionGrantError(
        INJECTION_ERROR_CODES.grantDenied,
        "consume variable key does not match grant binding",
      );
    }
  } else if (selector.secretId !== bound.secretId) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "consume secret id does not match grant binding",
    );
  }

  return {
    secretId: bound.secretId,
    variableKey: bound.variableKey,
  };
}
