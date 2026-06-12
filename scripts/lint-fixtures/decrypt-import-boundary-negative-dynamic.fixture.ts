/**
 * Negative lint fixture for ADR-0071 dynamic import boundary.
 * This file must fail `eslint` when linted directly.
 */
export async function unallowlistedDynamicDecryptImport(): Promise<unknown> {
  return import("@insecur/crypto");
}
