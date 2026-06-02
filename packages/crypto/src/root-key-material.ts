import { RootKeyNotConfiguredError } from "./errors.js";

export const INSTANCE_ROOT_KEY_HEX_LENGTH = 64;
export const INSTANCE_ROOT_KEY_BYTE_LENGTH = 32;

export function parseInstanceRootKeyHex(hex: string | undefined): Uint8Array {
  const trimmed = hex?.trim();
  if (trimmed?.length !== INSTANCE_ROOT_KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(trimmed)) {
    throw new RootKeyNotConfiguredError();
  }
  const bytes = new Uint8Array(INSTANCE_ROOT_KEY_BYTE_LENGTH);
  for (let index = 0; index < INSTANCE_ROOT_KEY_BYTE_LENGTH; index += 1) {
    bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function tryParseInstanceRootKeyHex(hex: string | undefined): Uint8Array | undefined {
  try {
    return parseInstanceRootKeyHex(hex);
  } catch {
    return undefined;
  }
}
