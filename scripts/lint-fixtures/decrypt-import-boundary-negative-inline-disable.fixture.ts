/**
 * Negative lint fixture for ADR-0071 inline-disable bypass.
 * eslint-disable must not silence the decrypt import boundary (noInlineConfig).
 */
// eslint-disable-next-line no-restricted-imports
import { decryptSecretValueForRuntime } from "@insecur/crypto";

export function inlineDisabledDecryptImport(): typeof decryptSecretValueForRuntime {
  return decryptSecretValueForRuntime;
}
