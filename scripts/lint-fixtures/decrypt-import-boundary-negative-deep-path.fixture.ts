/**
 * Negative lint fixture for ADR-0071 deep-path static import boundary.
 * This file must fail `eslint` when linted directly.
 */
import { decryptSecretValueForRuntime } from "../../packages/crypto/src/envelope.js";

export function unallowlistedDeepPathDecryptImport(): typeof decryptSecretValueForRuntime {
  return decryptSecretValueForRuntime;
}
