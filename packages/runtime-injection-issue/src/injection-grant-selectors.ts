import { INJECTION_ERROR_CODES } from "@insecur/domain";
import type { SecretId, VariableKey } from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";

export type InjectionGrantIssueSelector =
  | { kind: "variable_key"; variableKey: VariableKey }
  | { kind: "secret_id"; secretId: SecretId };

export type InjectionGrantConsumeSelector =
  | { kind: "variable_key"; variableKey: VariableKey }
  | { kind: "secret_id"; secretId: SecretId };

export function normalizeConsumeSelector(input: {
  variableKey?: VariableKey;
  secretId?: SecretId;
}): InjectionGrantConsumeSelector {
  const hasVariableKey = input.variableKey !== undefined;
  const hasSecretId = input.secretId !== undefined;
  if (hasVariableKey === hasSecretId) {
    throw new Error("exactly one of variableKey or secretId is required to consume");
  }
  if (input.secretId !== undefined) {
    return { kind: "secret_id", secretId: input.secretId };
  }
  if (input.variableKey === undefined) {
    throw new Error("exactly one of variableKey or secretId is required to consume");
  }
  return { kind: "variable_key", variableKey: input.variableKey };
}

/** First Value grants bind exactly one Secret per issue/consume cycle. */
export function assertSingleIssueSelectorCount(selectorCount: number): void {
  if (selectorCount !== 1) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection grant allows exactly one secret binding",
    );
  }
}
