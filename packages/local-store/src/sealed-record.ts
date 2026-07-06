import { createCipheriv, createDecipheriv, randomBytes as nodeRandomBytes } from "node:crypto";

import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";
import { assertMachineRootKeyHex } from "./machine-root-key.js";

/** Format prefix for records sealed under the machine root key. */
export const SEALED_RECORD_V1_PREFIX = "insecur.sealed.v1";

const GCM_IV_BYTE_LENGTH = 12;
const GCM_TAG_BYTE_LENGTH = 16;

function keyFromHex(machineRootKeyHex: string): Buffer {
  return Buffer.from(assertMachineRootKeyHex(machineRootKeyHex), "hex");
}

export function sealLocalRecord(
  machineRootKeyHex: string,
  plaintextUtf8: string,
  randomBytes: (size: number) => Uint8Array = nodeRandomBytes,
): string {
  const iv = Buffer.from(randomBytes(GCM_IV_BYTE_LENGTH));
  if (iv.length !== GCM_IV_BYTE_LENGTH) {
    throw new KeyStoreError(
      KEY_STORE_ERROR_CODES.invalidMaterial,
      "sealed record iv has invalid byte length",
    );
  }
  const cipher = createCipheriv("aes-256-gcm", keyFromHex(machineRootKeyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextUtf8, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SEALED_RECORD_V1_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

function invalidSealedRecord(message: string, cause?: unknown): KeyStoreError {
  return new KeyStoreError(KEY_STORE_ERROR_CODES.invalidMaterial, message, { cause });
}

export function unsealLocalRecord(machineRootKeyHex: string, sealed: string): string {
  const parts = sealed.trim().split(":");
  if (parts.length !== 4 || parts[0] !== SEALED_RECORD_V1_PREFIX) {
    throw invalidSealedRecord("sealed record has invalid format");
  }
  const [, ivBase64, tagBase64, ciphertextBase64] = parts as [string, string, string, string];
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  if (iv.length !== GCM_IV_BYTE_LENGTH || tag.length !== GCM_TAG_BYTE_LENGTH) {
    throw invalidSealedRecord("sealed record has invalid format");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFromHex(machineRootKeyHex), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw invalidSealedRecord("sealed record failed authentication", error);
  }
}
