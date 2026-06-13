import { RootKeyNotConfiguredError } from "./errors.js";
import type { Keyring } from "./keyring.js";

let configuredKeyring: Keyring | undefined;

export function configureKeyring(keyring: Keyring): void {
  configuredKeyring = keyring;
}

export function isKeyringConfigured(): boolean {
  return configuredKeyring !== undefined;
}

export function resetKeyringForTests(): void {
  configuredKeyring = undefined;
}

export function getKeyring(): Keyring {
  if (configuredKeyring) {
    return configuredKeyring;
  }

  throw new RootKeyNotConfiguredError();
}
