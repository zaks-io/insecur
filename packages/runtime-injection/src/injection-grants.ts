import type { EnvironmentId, InjectionGrantId, ProjectId, VariableKey } from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

export interface IssueInjectionGrantInput {
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKeys: readonly [VariableKey, ...VariableKey[]];
}

export interface IssueInjectionGrantResult {
  grantId: InjectionGrantId;
  expiresAt: string;
}

export interface ConsumeInjectionGrantInput {
  grantId: InjectionGrantId;
  variableKey: VariableKey;
}

/**
 * One-time grant consume returns env entries for the child process only.
 * Values must not be logged or returned in metadata-only CLI/API envelopes.
 */
export interface ConsumeInjectionGrantResult {
  variableKey: VariableKey;
  /** Process-environment delivery only; never serialize to metadata envelopes. */
  valueUtf8: Uint8Array;
}

export function issueInjectionGrant(
  input: IssueInjectionGrantInput,
): Promise<IssueInjectionGrantResult> {
  void input;
  return Promise.reject(new NotImplementedError("issueInjectionGrant"));
}

export function consumeInjectionGrant(
  input: ConsumeInjectionGrantInput,
): Promise<ConsumeInjectionGrantResult> {
  void input;
  return Promise.reject(new NotImplementedError("consumeInjectionGrant"));
}
