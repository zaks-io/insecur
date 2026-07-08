import {
  includesExactBindingPatternMarker,
  RUNTIME_POLICY_ERROR_CODES,
  parseOpaqueResourceId,
  parseVariableKey,
  secretId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";

import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";

export interface RuntimeInjectionPolicyBindingsInput {
  secretIds: readonly string[];
  variableKeys: readonly string[];
}

export interface ValidatedRuntimeInjectionPolicyBindings {
  secretIds: readonly SecretId[];
  variableKeys: readonly VariableKey[];
}

function rejectPatternBinding(raw: string, kind: "secret_id" | "variable_key"): never {
  throw new RuntimeInjectionPolicyError(
    RUNTIME_POLICY_ERROR_CODES.patternBindingRejected,
    `runtime injection policy rejects pattern-based ${kind} binding`,
  );
}

function assertNoPatternMarkers(raw: string, kind: "secret_id" | "variable_key"): void {
  if (includesExactBindingPatternMarker(raw)) {
    rejectPatternBinding(raw, kind);
  }
}

function parseExactSecretId(raw: string): SecretId {
  assertNoPatternMarkers(raw, "secret_id");
  const parsed = parseOpaqueResourceId(raw, "sec");
  if (!parsed.ok) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.invalidBindings,
      "runtime injection policy secret binding must be an exact secret id",
    );
  }
  return secretId.brand(parsed.value);
}

function parseExactVariableKey(raw: string): VariableKey {
  assertNoPatternMarkers(raw, "variable_key");
  const parsed = parseVariableKey(raw);
  if (!parsed.ok) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.invalidBindings,
      "runtime injection policy variable key binding must be exact",
    );
  }
  return parsed.value;
}

/** Validates exact secret and variable key bindings; rejects wildcards and broad selection. */
export function validateRuntimeInjectionPolicyBindings(
  input: RuntimeInjectionPolicyBindingsInput,
): ValidatedRuntimeInjectionPolicyBindings {
  const secretIds = input.secretIds.map(parseExactSecretId);
  const variableKeys = input.variableKeys.map(parseExactVariableKey);

  if (secretIds.length === 0 && variableKeys.length === 0) {
    throw new RuntimeInjectionPolicyError(
      RUNTIME_POLICY_ERROR_CODES.invalidBindings,
      "runtime injection policy requires at least one exact binding",
    );
  }

  const seenSecretIds = new Set<string>();
  for (const id of secretIds) {
    if (seenSecretIds.has(id)) {
      throw new RuntimeInjectionPolicyError(
        RUNTIME_POLICY_ERROR_CODES.invalidBindings,
        "runtime injection policy secret bindings must be unique",
      );
    }
    seenSecretIds.add(id);
  }

  const seenVariableKeys = new Set<string>();
  for (const key of variableKeys) {
    if (seenVariableKeys.has(key)) {
      throw new RuntimeInjectionPolicyError(
        RUNTIME_POLICY_ERROR_CODES.invalidBindings,
        "runtime injection policy variable key bindings must be unique",
      );
    }
    seenVariableKeys.add(key);
  }

  return { secretIds, variableKeys };
}
