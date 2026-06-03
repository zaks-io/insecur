import { RootKeyNotConfiguredError } from "./errors.js";
import { createKeyring, type Keyring } from "./keyring.js";
import { tryParseInstanceRootKeyHex } from "./root-key-material.js";

let configuredKeyring: Keyring | undefined;

function readDevRootKeyFromEnv(): Uint8Array | undefined {
  return tryParseInstanceRootKeyHex(process.env.INSECUR_INSTANCE_ROOT_KEY_HEX);
}

export function configureKeyring(keyring: Keyring): void {
  configuredKeyring = keyring;
}

export function resetKeyringForTests(): void {
  configuredKeyring = undefined;
}

export function getKeyring(): Keyring {
  if (configuredKeyring) {
    return configuredKeyring;
  }

  const fromEnv = readDevRootKeyFromEnv();
  if (!fromEnv) {
    throw new RootKeyNotConfiguredError();
  }

  configuredKeyring = createKeyring(fromEnv);
  return configuredKeyring;
}
