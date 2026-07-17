import { blake2b } from "@noble/hashes/blake2.js";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";

import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";

import { sealSecretForGitHub } from "../src/github-sealed-box.js";
import { SecretSyncError } from "../src/secret-sync-error.js";

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Reference libsodium sealed-box open: epk || box, nonce = blake2b24(epk || pk). */
function openSealedBox(sealed: Uint8Array, recipient: nacl.BoxKeyPair): Uint8Array | null {
  const ephemeralPublicKey = sealed.slice(0, 32);
  const boxed = sealed.slice(32);
  const nonceInput = new Uint8Array(64);
  nonceInput.set(ephemeralPublicKey, 0);
  nonceInput.set(recipient.publicKey, 32);
  const nonce = blake2b(nonceInput, { dkLen: 24 });
  return nacl.box.open(boxed, nonce, ephemeralPublicKey, recipient.secretKey);
}

describe("sealSecretForGitHub", () => {
  it("produces a libsodium-compatible sealed box the recipient key can open", () => {
    const recipient = nacl.box.keyPair();
    const plaintext = new TextEncoder().encode("sealed-box-roundtrip-value");

    const sealedBase64 = sealSecretForGitHub(toBase64(recipient.publicKey), plaintext);
    const opened = openSealedBox(fromBase64(sealedBase64), recipient);

    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened ?? new Uint8Array())).toBe("sealed-box-roundtrip-value");
  });

  it("never emits the plaintext inside the sealed payload", () => {
    const recipient = nacl.box.keyPair();
    const plaintext = new TextEncoder().encode("super-sensitive-value");

    const sealedBase64 = sealSecretForGitHub(toBase64(recipient.publicKey), plaintext);

    expect(sealedBase64).not.toContain("super-sensitive-value");
    expect(Buffer.from(sealedBase64, "base64").includes(Buffer.from(plaintext))).toBe(false);
  });

  it("uses a fresh ephemeral key per seal", () => {
    const recipient = nacl.box.keyPair();
    const plaintext = new TextEncoder().encode("value");

    const first = sealSecretForGitHub(toBase64(recipient.publicKey), plaintext);
    const second = sealSecretForGitHub(toBase64(recipient.publicKey), plaintext);

    expect(first).not.toBe(second);
  });

  it.each([
    ["not base64", "!!!not-base64!!!"],
    ["wrong length", toBase64(new Uint8Array(31))],
  ])("fails closed on an invalid recipient key (%s)", (_label, key) => {
    expect(() => sealSecretForGitHub(key, new Uint8Array([1]))).toThrowError(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidDestination }) as Error,
    );
    expect(() => sealSecretForGitHub(key, new Uint8Array([1]))).toThrowError(SecretSyncError);
  });
});
