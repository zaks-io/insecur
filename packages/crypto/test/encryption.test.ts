import {
  CRYPTO_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { DecryptError } from "../src/errors.js";
import {
  decryptSecretValueForRuntime,
  encryptSecretValue,
  type SecretCiphertextIdentity,
} from "../src/encryption.js";
import { toStoreFacingCiphertext } from "../src/envelope-storage.js";
import { createKeyring, type Keyring } from "../src/keyring.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const ORG_B = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const PROJECT_B = projectId.brand("prj_01JZ8E5Y6E0O4K8Q3R5S7T9U1X");
const ENV_A = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const ENV_B = environmentId.brand("env_01JZ8E7A8G2Q6M0S5U7V9W1X3Z");
const SECRET_A = secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A");
const SECRET_B = secretId.brand("sec_01JZ8E9C0I4S8O2U7W9X1Y3Z5B");

function identity(overrides: Partial<SecretCiphertextIdentity> = {}): SecretCiphertextIdentity {
  return {
    organizationId: ORG_A,
    projectId: PROJECT_A,
    environmentId: ENV_A,
    secretId: SECRET_A,
    ...overrides,
  };
}

function samplePlaintext(): Uint8Array {
  return new TextEncoder().encode("runtime-injection-value");
}

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

function tamperCiphertextTail(ciphertext: Uint8Array): Uint8Array {
  const tampered = new Uint8Array(ciphertext);
  const lastIndex = tampered.byteLength - 1;
  const lastByte = tampered[lastIndex];
  if (lastByte !== undefined) {
    tampered[lastIndex] = lastByte ^ 0xff;
  }
  return tampered;
}

async function decryptFailureCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    expect.fail("expected decrypt to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(DecryptError);
    return (error as DecryptError).code;
  }
}

describe("encryptSecretValue / decryptSecretValueForRuntime", () => {
  let keyring: Keyring;

  beforeEach(() => {
    keyring = createKeyring(createTestRootKey());
  });

  it("round-trips plaintext without returning key material", async () => {
    const plaintext = samplePlaintext();
    const wrapped = await encryptSecretValue(keyring, identity(), plaintext);
    const decrypted = await decryptSecretValueForRuntime(keyring, identity(), wrapped);

    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
    expect(wrapped).not.toHaveProperty("dek");
    expect(wrapped).not.toHaveProperty("projectDataKey");
    expect(wrapped).not.toHaveProperty("organizationDataKey");
    expect(wrapped).not.toHaveProperty("rootKey");
  });

  it("includes project and organization data-key version metadata", async () => {
    const wrapped = await encryptSecretValue(keyring, identity(), samplePlaintext());

    expect(wrapped.organizationDataKeyVersion).toBe(1);
    expect(wrapped.projectDataKeyVersion).toBe(1);
    expect(wrapped.ciphertext.byteLength).toBeGreaterThan(64);
  });

  it("fails closed when ciphertext is used under a different tenant identity", async () => {
    const wrapped = await encryptSecretValue(keyring, identity(), samplePlaintext());
    const storeFacing = {
      organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
      projectDataKeyVersion: wrapped.projectDataKeyVersion,
      ciphertext: toStoreFacingCiphertext(wrapped),
    };

    await expect(
      decryptSecretValueForRuntime(
        keyring,
        identity({ organizationId: ORG_B, projectId: PROJECT_B }),
        storeFacing,
      ),
    ).rejects.toBeInstanceOf(DecryptError);

    await expect(
      decryptSecretValueForRuntime(
        keyring,
        identity({ environmentId: ENV_B, secretId: SECRET_B }),
        storeFacing,
      ),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("returns opaque decrypt errors without distinguishing failure modes", async () => {
    const wrapped = await encryptSecretValue(keyring, identity(), samplePlaintext());
    const tampered = new Uint8Array(wrapped.ciphertext);
    const lastIndex = tampered.byteLength - 1;
    const lastByte = tampered[lastIndex];
    if (lastByte !== undefined) {
      tampered[lastIndex] = lastByte ^ 0xff;
    }

    await expect(
      decryptSecretValueForRuntime(keyring, identity(), {
        ...wrapped,
        ciphertext: tampered,
      }),
    ).rejects.toMatchObject({
      name: "DecryptError",
      message: "decrypt failed",
      code: CRYPTO_ERROR_CODES.decryptFailed,
      retryable: false,
    });

    try {
      await decryptSecretValueForRuntime(keyring, identity(), {
        ...wrapped,
        ciphertext: tampered,
      });
      expect.fail("expected decrypt to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DecryptError);
      expect(String(error)).not.toMatch(/aad|identity|key version|auth/i);
    }
  });

  it("uses the same decrypt failure code for wrong key, tampering, and identity mismatch", async () => {
    const wrapped = await encryptSecretValue(keyring, identity(), samplePlaintext());
    const storeFacing = {
      organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
      projectDataKeyVersion: wrapped.projectDataKeyVersion,
      ciphertext: toStoreFacingCiphertext(wrapped),
    };
    const tampered = tamperCiphertextTail(wrapped.ciphertext);

    const identityMismatchCode = await decryptFailureCode(() =>
      decryptSecretValueForRuntime(
        keyring,
        identity({ organizationId: ORG_B, projectId: PROJECT_B }),
        storeFacing,
      ),
    );

    const tamperedCiphertextCode = await decryptFailureCode(() =>
      decryptSecretValueForRuntime(keyring, identity(), {
        ...wrapped,
        ciphertext: tampered,
      }),
    );

    const wrongKeyring = createKeyring(createTestRootKey());

    const wrongKeyCode = await decryptFailureCode(() =>
      decryptSecretValueForRuntime(wrongKeyring, identity(), wrapped),
    );

    expect(identityMismatchCode).toBe(CRYPTO_ERROR_CODES.decryptFailed);
    expect(tamperedCiphertextCode).toBe(CRYPTO_ERROR_CODES.decryptFailed);
    expect(wrongKeyCode).toBe(CRYPTO_ERROR_CODES.decryptFailed);
    expect(new Set([identityMismatchCode, tamperedCiphertextCode, wrongKeyCode]).size).toBe(1);
  });

  it("does not persist plaintext or identity strings in store-facing ciphertext bytes", async () => {
    const plaintext = samplePlaintext();
    const bound = identity();
    const wrapped = await encryptSecretValue(keyring, bound, plaintext);
    const stored = toStoreFacingCiphertext(wrapped);
    const storedText = new TextDecoder().decode(stored);

    expect(storedText).not.toContain(new TextDecoder().decode(plaintext));
    expect(storedText).not.toContain(bound.organizationId);
    expect(storedText).not.toContain(bound.projectId);
    expect(storedText).not.toContain(bound.environmentId);
    expect(storedText).not.toContain(bound.secretId);
  });

  it("isolates tenants when keyrings use different root keys", async () => {
    const wrapped = await encryptSecretValue(keyring, identity(), samplePlaintext());

    const wrongKeyring = createKeyring(createTestRootKey());

    await expect(
      decryptSecretValueForRuntime(wrongKeyring, identity(), wrapped),
    ).rejects.toBeInstanceOf(DecryptError);
  });
});
