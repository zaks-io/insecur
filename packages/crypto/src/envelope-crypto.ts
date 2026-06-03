import { toBufferSource } from "./buffer.js";
import { GCM_IV_LENGTH } from "./constants.js";

export function randomIv(): Uint8Array {
  const iv = new Uint8Array(GCM_IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

export async function aesGcmEncrypt(
  key: CryptoKey,
  iv: Uint8Array,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(iv),
      additionalData: toBufferSource(additionalData),
    },
    key,
    toBufferSource(plaintext),
  );
  return new Uint8Array(ciphertext);
}

export async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(iv),
      additionalData: toBufferSource(additionalData),
    },
    key,
    toBufferSource(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
