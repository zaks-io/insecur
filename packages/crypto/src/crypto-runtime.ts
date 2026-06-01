import { createKeyring, type Keyring } from "./keyring.js";

let configuredKeyring: Keyring | undefined;

function readDevRootKeyFromEnv(): Uint8Array | undefined {
  const hex = process.env.INSECUR_INSTANCE_ROOT_KEY_HEX?.trim();
  if (hex?.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return undefined;
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function createDefaultKeyring(): Keyring {
  const fromEnv = readDevRootKeyFromEnv();
  if (fromEnv) {
    return createKeyring(fromEnv);
  }
  const ephemeral = new Uint8Array(32);
  crypto.getRandomValues(ephemeral);
  return createKeyring(ephemeral);
}

export function configureKeyring(keyring: Keyring): void {
  configuredKeyring = keyring;
}

export function resetKeyringForTests(): void {
  configuredKeyring = undefined;
}

export function getKeyring(): Keyring {
  configuredKeyring ??= createDefaultKeyring();
  return configuredKeyring;
}
