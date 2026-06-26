import { parseVariableKey, VALIDATION_ERROR_CODES, type VariableKey } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";

export function parseVariableKeyOrThrow(raw: string): VariableKey {
  const parsed = parseVariableKey(raw);
  if (!parsed.ok) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
      message: `Invalid variable key: ${raw}. Keys must match ^[A-Z_][A-Z0-9_]*$.`,
      retryable: false,
    });
  }
  return parsed.value;
}
