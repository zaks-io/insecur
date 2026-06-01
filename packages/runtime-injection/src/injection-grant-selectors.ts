import type { SecretId, VariableKey } from "@insecur/domain";

export type InjectionGrantIssueSelector =
  | { kind: "variable_key"; variableKey: VariableKey }
  | { kind: "secret_id"; secretId: SecretId };

export type InjectionGrantConsumeSelector =
  | { kind: "variable_key"; variableKey: VariableKey }
  | { kind: "secret_id"; secretId: SecretId };

export function assertNonEmptyIssueSelectors(
  selectors: readonly InjectionGrantIssueSelector[],
): asserts selectors is readonly [InjectionGrantIssueSelector, ...InjectionGrantIssueSelector[]] {
  if (selectors.length === 0) {
    throw new Error("at least one injection grant selector is required");
  }
}

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
