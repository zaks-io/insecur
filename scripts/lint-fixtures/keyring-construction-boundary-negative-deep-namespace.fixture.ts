/**
 * Negative lint fixture for ADR-0064/0077 deep-path namespace import boundary.
 * This file must fail `eslint` when linted directly.
 */
import * as keyringModule from "../../packages/crypto/src/keyring.js";

export function unallowlistedDeepNamespaceKeyringImport(): typeof keyringModule.createKeyring {
  return keyringModule.createKeyring;
}
