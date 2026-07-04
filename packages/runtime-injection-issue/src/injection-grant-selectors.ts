import { INJECTION_ERROR_CODES } from "@insecur/domain";
import type { SecretId, VariableKey } from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";

export type InjectionGrantIssueSelector =
  | { kind: "variable_key"; variableKey: VariableKey }
  | { kind: "secret_id"; secretId: SecretId }
  | { kind: "policy_id"; policyId: import("@insecur/domain").RuntimePolicyId };

export type InjectionGrantConsumeSelector =
  | { kind: "variable_key"; variableKey: VariableKey }
  | { kind: "secret_id"; secretId: SecretId };

function invalidConsumeSelectorError(): InjectionGrantError {
  return new InjectionGrantError(
    INJECTION_ERROR_CODES.grantDenied,
    "exactly one of variableKey or secretId is required to consume",
  );
}

export function normalizeConsumeSelector(input: {
  variableKey?: VariableKey;
  secretId?: SecretId;
}): InjectionGrantConsumeSelector {
  const hasVariableKey = input.variableKey !== undefined;
  const hasSecretId = input.secretId !== undefined;
  if (hasVariableKey === hasSecretId) {
    throw invalidConsumeSelectorError();
  }
  if (input.secretId !== undefined) {
    return { kind: "secret_id", secretId: input.secretId };
  }
  if (input.variableKey === undefined) {
    throw invalidConsumeSelectorError();
  }
  return { kind: "variable_key", variableKey: input.variableKey };
}

/** Counts secret bindings represented by one issue selector. */
export function issueSelectorBindingCount(selector: InjectionGrantIssueSelector): number {
  if (selector.kind === "policy_id") {
    return -1;
  }
  if (selector.kind === "variable_key") {
    return selector.variableKey === "" ? 0 : 1;
  }
  return 1;
}

/** First Value grants bind exactly one Secret per issue/consume cycle. */
export function assertSingleIssueSelectorCount(selector: InjectionGrantIssueSelector): void {
  if (selector.kind === "policy_id") {
    return;
  }
  if (issueSelectorBindingCount(selector) !== 1) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection grant allows exactly one secret binding",
    );
  }
}
