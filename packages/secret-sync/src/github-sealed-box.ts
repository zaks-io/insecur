import { blake2b } from "@noble/hashes/blake2.js";
import nacl from "tweetnacl";

import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";

import { SecretSyncError } from "./secret-sync-error.js";

const CURVE25519_PUBLIC_KEY_BYTES = 32;
const SEALED_BOX_NONCE_BYTES = 24;

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "github destination public key is not valid base64",
    );
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * libsodium `crypto_box_seal` (X25519 + XSalsa20-Poly1305 with an ephemeral
 * sender key and a BLAKE2b-derived nonce), which is the only payload format
 * the GitHub Actions secrets API accepts. The recipient public key comes from
 * GitHub's metadata-only repo/environment public-key endpoint; the output is
 * ciphertext safe to send in the PUT request body. The plaintext is consumed
 * in-memory only and never returned, logged, or thrown.
 */
export function sealSecretForGitHub(
  recipientPublicKeyBase64: string,
  plaintext: Uint8Array,
): string {
  const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
  if (recipientPublicKey.length !== CURVE25519_PUBLIC_KEY_BYTES) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "github destination public key has an invalid length",
    );
  }

  const ephemeral = nacl.box.keyPair();
  const nonceInput = new Uint8Array(ephemeral.publicKey.length + recipientPublicKey.length);
  nonceInput.set(ephemeral.publicKey, 0);
  nonceInput.set(recipientPublicKey, ephemeral.publicKey.length);
  const nonce = blake2b(nonceInput, { dkLen: SEALED_BOX_NONCE_BYTES });

  const boxed = nacl.box(plaintext, nonce, recipientPublicKey, ephemeral.secretKey);
  ephemeral.secretKey.fill(0);

  const sealed = new Uint8Array(ephemeral.publicKey.length + boxed.length);
  sealed.set(ephemeral.publicKey, 0);
  sealed.set(boxed, ephemeral.publicKey.length);
  return encodeBase64(sealed);
}
