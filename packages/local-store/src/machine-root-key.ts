import { randomBytes as nodeRandomBytes } from "node:crypto";

import { MACHINE_ROOT_KEY_BYTE_LENGTH, MACHINE_ROOT_KEY_HEX_LENGTH } from "./constants.js";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";

export function bytesToMachineRootKeyHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function generateMachineRootKeyHex(
  randomBytes: (size: number) => Uint8Array = nodeRandomBytes,
): string {
  return bytesToMachineRootKeyHex(randomBytes(MACHINE_ROOT_KEY_BYTE_LENGTH));
}

export function assertMachineRootKeyHex(hex: string): string {
  const trimmed = hex.trim();
  if (trimmed.length !== MACHINE_ROOT_KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(trimmed)) {
    throw new KeyStoreError(
      KEY_STORE_ERROR_CODES.invalidMaterial,
      "machine root key material has invalid format",
    );
  }
  return trimmed.toLowerCase();
}
