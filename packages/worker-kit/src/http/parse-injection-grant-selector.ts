import {
  VALIDATION_ERROR_CODES,
  runtimePolicyId,
  type RuntimePolicyId,
  type SecretId,
} from "@insecur/domain";

import {
  parseOptionalSecretId,
  parseVariableKeyField,
  readOptionalString,
  readRequiredString,
} from "./parse-route-input.js";

type InjectionGrantSelectorInput =
  | { kind: "variable_key"; variableKey: ReturnType<typeof parseVariableKeyField> }
  | { kind: "secret_id"; secretId: SecretId };

export type InjectionGrantIssueSelectorInput =
  InjectionGrantSelectorInput | { kind: "policy_id"; policyId: RuntimePolicyId };

export type InjectionGrantConsumeSelectorInput = InjectionGrantSelectorInput;

function hasOwnField(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function parseSingleInjectionGrantSelector(
  body: Record<string, unknown>,
): InjectionGrantSelectorInput {
  const hasVariableKey = hasOwnField(body, "variableKey");
  const hasSecretId = hasOwnField(body, "secretId");

  if (hasVariableKey === hasSecretId) {
    throw Object.assign(new Error("Exactly one of variableKey or secretId is required."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }

  if (hasSecretId) {
    const secretIdRaw = readOptionalString(body, "secretId");
    const parsedSecretId = parseOptionalSecretId(secretIdRaw);
    if (parsedSecretId === undefined) {
      throw Object.assign(new Error("Invalid secret id."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return { kind: "secret_id", secretId: parsedSecretId };
  }

  const variableKeyRaw = readOptionalString(body, "variableKey");
  return { kind: "variable_key", variableKey: parseVariableKeyField(variableKeyRaw ?? "") };
}

export function parseInjectionGrantIssueSelector(
  body: Record<string, unknown>,
): InjectionGrantIssueSelectorInput {
  const hasVariableKey = hasOwnField(body, "variableKey");
  const hasSecretId = hasOwnField(body, "secretId");
  const hasPolicyId = hasOwnField(body, "policyId");
  const selectorCount = [hasVariableKey, hasSecretId, hasPolicyId].filter(Boolean).length;
  if (selectorCount !== 1) {
    throw Object.assign(
      new Error("Exactly one of variableKey, secretId, or policyId is required."),
      {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      },
    );
  }
  if (hasPolicyId) {
    const policyIdRaw = readRequiredString(body, "policyId");
    const parsedPolicyId = runtimePolicyId.parse(policyIdRaw);
    if (!parsedPolicyId.ok) {
      throw Object.assign(new Error("Invalid runtime injection policy id."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return { kind: "policy_id", policyId: parsedPolicyId.value };
  }
  return parseSingleInjectionGrantSelector(body);
}

export function parseInjectionGrantConsumeSelector(
  body: Record<string, unknown>,
): InjectionGrantConsumeSelectorInput {
  return parseSingleInjectionGrantSelector(body);
}
