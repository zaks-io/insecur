/**
 * Negative lint fixture for ADR-0064/0077 deep-path static import boundary.
 * This file must fail `eslint` when linted directly.
 */
import { createKeyring } from "../../packages/crypto/src/keyring.js";

export function unallowlistedDeepPathKeyringImport(): typeof createKeyring {
  return createKeyring;
}
