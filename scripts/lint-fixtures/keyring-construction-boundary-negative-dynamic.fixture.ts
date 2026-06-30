/**
 * Negative lint fixture for ADR-0064/0077 dynamic deep-path import boundary.
 * This file must fail `eslint` when linted directly.
 */
export async function unallowlistedDynamicKeyringImport(): Promise<unknown> {
  return import("../../packages/crypto/src/keyring.js");
}
