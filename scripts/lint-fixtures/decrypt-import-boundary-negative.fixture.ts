/**
 * Negative lint fixture for ADR-0071. This file must fail `eslint` when linted directly.
 * It is excluded from package `src/` lint paths; see decrypt-import-boundary.test.ts.
 */
import { decryptSecretValueForRuntime } from "@insecur/crypto";

export function unallowlistedDecryptImport(): typeof decryptSecretValueForRuntime {
  return decryptSecretValueForRuntime;
}
