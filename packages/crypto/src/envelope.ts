import { toBufferSource } from "./buffer.js";
import { GCM_IV_LENGTH } from "./constants.js";
import { DecryptError } from "./errors.js";
import {
  ENVELOPE_HEADER_LENGTH,
  parseEnvelopeLayout,
  writeEnvelopeHeader,
} from "./envelope-layout.js";
import { serializeDekWrapAad, serializeSecretCiphertextAad } from "./identity-binding.js";
import type { SecretCiphertextIdentity } from "./types.js";

function randomIv(): Uint8Array {
  const iv = new Uint8Array(GCM_IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

async function aesGcmEncrypt(
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

async function aesGcmDecrypt(
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

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export interface SealSecretValueInput {
  identity: SecretCiphertextIdentity;
  plaintextUtf8: Uint8Array;
  projectDataKey: CryptoKey;
  projectDataKeyVersion: number;
}

export async function sealSecretValue(input: SealSecretValueInput): Promise<Uint8Array> {
  const dek = new Uint8Array(32);
  crypto.getRandomValues(dek);
  const dekKey = await crypto.subtle.importKey("raw", toBufferSource(dek), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

  const dekWrapIv = randomIv();
  const valueIv = randomIv();
  const wrappedDek = await aesGcmEncrypt(
    input.projectDataKey,
    dekWrapIv,
    dek,
    serializeDekWrapAad(input.projectDataKeyVersion),
  );
  const valueCiphertext = await aesGcmEncrypt(
    dekKey,
    valueIv,
    input.plaintextUtf8,
    serializeSecretCiphertextAad(input.identity),
  );

  const header = writeEnvelopeHeader({
    projectDataKeyVersion: input.projectDataKeyVersion,
    dekWrapIv,
    wrappedDekLength: wrappedDek.byteLength,
    valueIv,
    valueCiphertextLength: valueCiphertext.byteLength,
  });
  return concatBytes(header, wrappedDek, valueCiphertext);
}

export interface OpenSecretValueInput {
  identity: SecretCiphertextIdentity;
  envelopeBytes: Uint8Array;
  projectDataKey: CryptoKey;
}

async function decryptParsedEnvelope(
  layout: ReturnType<typeof parseEnvelopeLayout>,
  identity: SecretCiphertextIdentity,
  projectDataKey: CryptoKey,
): Promise<Uint8Array> {
  const dekBytes = await aesGcmDecrypt(
    projectDataKey,
    layout.dekWrapIv,
    layout.wrappedDek,
    serializeDekWrapAad(layout.projectDataKeyVersion),
  );
  const dekKey = await crypto.subtle.importKey("raw", toBufferSource(dekBytes), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return aesGcmDecrypt(
    dekKey,
    layout.valueIv,
    layout.valueCiphertext,
    serializeSecretCiphertextAad(identity),
  );
}

export async function openSecretValue(input: OpenSecretValueInput): Promise<Uint8Array> {
  try {
    const layout = parseEnvelopeLayout(input.envelopeBytes);
    return await decryptParsedEnvelope(layout, input.identity, input.projectDataKey);
  } catch (error) {
    if (error instanceof DecryptError) {
      throw error;
    }
    throw new DecryptError();
  }
}

/** Bytes persisted by the Secret Version Store (no caller identity echo). */
export function toStoreFacingCiphertext(wrapped: { ciphertext: Uint8Array }): Uint8Array {
  return wrapped.ciphertext;
}

export { ENVELOPE_HEADER_LENGTH };
