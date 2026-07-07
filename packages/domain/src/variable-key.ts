import { type Brand, brandValue } from "./brand.js";

/**
 * Application-facing env-var-safe key (V1: `^[A-Z_][A-Z0-9_]*$`).
 * @see CONTEXT.md — Variable Key
 */
export type VariableKey = Brand<string, "VariableKey">;

export const VARIABLE_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export type ParseVariableKeyResult =
  { ok: true; value: VariableKey } | { ok: false; code: "validation.invalid_variable_key" };

export function parseVariableKey(raw: string): ParseVariableKeyResult {
  if (!VARIABLE_KEY_PATTERN.test(raw)) {
    return { ok: false, code: "validation.invalid_variable_key" };
  }
  return { ok: true, value: brandValue<string, "VariableKey">(raw) };
}

export function isVariableKey(raw: string): raw is VariableKey {
  return parseVariableKey(raw).ok;
}
