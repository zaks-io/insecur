import { RootKeyNotConfiguredError } from "./errors.js";
import type { Keyring } from "./keyring.js";

/**
 * ADR-0064 guard for request-owned crypto calls.
 * This module validates caller-supplied keyrings only; it must not retain key material.
 */
export function requireKeyring(keyring: Keyring | undefined): Keyring {
  if (keyring) {
    return keyring;
  }

  throw new RootKeyNotConfiguredError();
}
