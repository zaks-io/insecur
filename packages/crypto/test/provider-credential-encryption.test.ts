import {
  appConnectionId,
  brandValue,
  CRYPTO_ERROR_CODES,
  organizationId,
  providerCredentialId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { DecryptError } from "../src/errors.js";
import {
  decryptProviderCredentialForProviderUse,
  encryptProviderCredential,
  type ProviderCredentialCiphertextIdentity,
} from "../src/encryption.js";
import { toStoreFacingCiphertext } from "../src/envelope-storage.js";
import { createKeyring, type Keyring } from "../src/keyring.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const ORG_B = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const CONN_A = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CONN_B = appConnectionId.brand("conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H");
const CRED_A = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const CRED_B = providerCredentialId.brand("pcred_01JZ8EJN9T4W7Y1A3D6E9G2H5L");

function identity(
  overrides: Partial<ProviderCredentialCiphertextIdentity> = {},
): ProviderCredentialCiphertextIdentity {
  return {
    organizationId: ORG_A,
    appConnectionId: CONN_A,
    provider: "vercel-integration-oauth",
    credentialId: CRED_A,
    ...overrides,
  };
}

function samplePlaintext(): Uint8Array {
  return new TextEncoder().encode("provider-credential-material");
}

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

describe("encryptProviderCredential / decryptProviderCredentialForProviderUse", () => {
  let keyring: Keyring;

  beforeEach(() => {
    keyring = createKeyring(createTestRootKey());
  });

  it("round-trips without returning key material", async () => {
    const plaintext = samplePlaintext();
    const wrapped = await encryptProviderCredential(keyring, identity(), plaintext);
    const decrypted = await decryptProviderCredentialForProviderUse(keyring, identity(), wrapped);

    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
    expect(wrapped.organizationDataKeyVersion).toBe(1);
    expect(wrapped).not.toHaveProperty("organizationDataKey");
    expect(wrapped).not.toHaveProperty("dek");
  });

  it("fails closed when ciphertext is used under a different identity", async () => {
    const wrapped = await encryptProviderCredential(keyring, identity(), samplePlaintext());
    const storeFacing = {
      organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
      ciphertext: toStoreFacingCiphertext(wrapped),
    };

    await expect(
      decryptProviderCredentialForProviderUse(
        keyring,
        identity({ organizationId: ORG_B, appConnectionId: CONN_B, credentialId: CRED_B }),
        storeFacing,
      ),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("returns opaque decrypt errors", async () => {
    const wrapped = await encryptProviderCredential(keyring, identity(), samplePlaintext());
    const tampered = new Uint8Array(wrapped.ciphertext);
    const lastIndex = tampered.byteLength - 1;
    const lastByte = tampered[lastIndex];
    if (lastByte !== undefined) {
      tampered[lastIndex] = lastByte ^ 0xff;
    }

    await expect(
      decryptProviderCredentialForProviderUse(keyring, identity(), {
        ...wrapped,
        ciphertext: tampered,
      }),
    ).rejects.toMatchObject({
      name: "DecryptError",
      code: CRYPTO_ERROR_CODES.decryptFailed,
      retryable: false,
    });
  });

  it("does not persist plaintext or identity strings in store-facing ciphertext bytes", async () => {
    const plaintext = samplePlaintext();
    const bound = identity();
    const wrapped = await encryptProviderCredential(keyring, bound, plaintext);
    const stored = toStoreFacingCiphertext(wrapped);
    const storedText = new TextDecoder().decode(stored);

    expect(storedText).not.toContain(new TextDecoder().decode(plaintext));
    expect(storedText).not.toContain(bound.organizationId);
    expect(storedText).not.toContain(bound.appConnectionId);
    expect(storedText).not.toContain(bound.provider);
    expect(storedText).not.toContain(bound.credentialId);
  });

  it("isolates tenants when keyrings use different root keys", async () => {
    const wrapped = await encryptProviderCredential(keyring, identity(), samplePlaintext());

    const wrongKeyring = createKeyring(createTestRootKey());

    await expect(
      decryptProviderCredentialForProviderUse(wrongKeyring, identity(), wrapped),
    ).rejects.toBeInstanceOf(DecryptError);
  });

  it("encrypts webhook signing secrets with whsub/whsec AAD bindings", async () => {
    const bound = identity({
      provider: "webhook-signing-secret",
      appConnectionId: brandValue<string, "AppConnectionId">("whsub_00000000000000000000000001"),
      credentialId: brandValue<string, "ProviderCredentialId">("whsec_00000000000000000000000001"),
    });
    const plaintext = samplePlaintext();
    const wrapped = await encryptProviderCredential(keyring, bound, plaintext);
    const decrypted = await decryptProviderCredentialForProviderUse(keyring, bound, wrapped);

    expect(decrypted.unwrapUtf8()).toEqual(plaintext);
  });
});
