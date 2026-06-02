import { parseVariableKey, VALIDATION_ERROR_CODES, type VariableKey } from "@insecur/domain";

import { SecretWriteError } from "./secret-write-error.js";

/**
 * Runtime validation for Variable Key at the Blind Secret Write boundary.
 * Re-parses the branded value so cast or forged strings cannot reach persistence.
 */
export function validateVariableKeyForWrite(variableKey: VariableKey): VariableKey {
  const parsed = parseVariableKey(variableKey);
  if (!parsed.ok) {
    throw new SecretWriteError(
      VALIDATION_ERROR_CODES.invalidVariableKey,
      "Variable Key must match the V1 env-var-safe pattern.",
    );
  }
  return parsed.value;
}
