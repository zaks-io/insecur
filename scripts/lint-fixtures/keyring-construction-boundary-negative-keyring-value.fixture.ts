/**
 * Negative lint fixture for ADR-0064/0077 Keyring value import boundary.
 * This file must fail `eslint` when linted directly.
 */
import { Keyring } from "@insecur/crypto";

export function unallowlistedKeyringValueImport(): typeof Keyring {
  return Keyring;
}
