import {
  CRYPTO_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { RootKeyNotConfiguredError } from "../src/errors.js";
import {
  decryptSecretValueForRuntime,
  encryptSecretValue,
  type SecretCiphertextIdentity,
} from "../src/encryption.js";
import {
  createKeyringFromSecretsStoreBinding,
  SecretsStoreRootKeyProvider,
  type SecretsStoreSecretBinding,
} from "../src/secrets-store-root-key-provider.js";
import { StaticRootKeyProvider, WrappedDefaultTenantDataKeySource } from "../src/keyring.js";

const identity: SecretCiphertextIdentity = {
  organizationId: organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  projectId: projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W"),
  environmentId: environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y"),
  secretId: secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A"),
};

function durableTestRootKeyHex(): string {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = index + 1;
  }
  return Array.from(root, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fakeBinding(get: SecretsStoreSecretBinding["get"]): SecretsStoreSecretBinding {
  return { get };
}

describe("SecretsStoreRootKeyProvider", () => {
  it("returns root key bytes for the supported version", async () => {
    const provider = new SecretsStoreRootKeyProvider(
      fakeBinding(() => Promise.resolve(durableTestRootKeyHex())),
    );
    const bytes = await provider.getRootKeyBytes(1);
    expect(bytes).toHaveLength(32);
    expect(bytes[0]).toBe(1);
  });

  it("rejects unsupported root key versions", async () => {
    const provider = new SecretsStoreRootKeyProvider(
      fakeBinding(() => Promise.resolve(durableTestRootKeyHex())),
    );
    await expect(provider.getRootKeyBytes(2)).rejects.toBeInstanceOf(RootKeyNotConfiguredError);
  });

  it("fails closed when binding get rejects", async () => {
    const provider = new SecretsStoreRootKeyProvider(
      fakeBinding(() => Promise.reject(new Error("binding unavailable"))),
    );
    await expect(provider.getRootKeyBytes(1)).rejects.toBeInstanceOf(RootKeyNotConfiguredError);
  });

  it("fails closed when binding value is malformed", async () => {
    const provider = new SecretsStoreRootKeyProvider(
      fakeBinding(() => Promise.resolve("not-a-root-key")),
    );
    await expect(provider.getRootKeyBytes(1)).rejects.toBeInstanceOf(RootKeyNotConfiguredError);
  });

  it("exposes ErrorBody-compatible failures", async () => {
    const provider = new SecretsStoreRootKeyProvider(
      fakeBinding(() => Promise.reject(new Error("binding unavailable"))),
    );
    try {
      await provider.getRootKeyBytes(1);
      expect.fail("expected root key failure");
    } catch (error) {
      expect(error).toBeInstanceOf(RootKeyNotConfiguredError);
      const rootError = error as RootKeyNotConfiguredError;
      expect(rootError.code).toBe(CRYPTO_ERROR_CODES.rootKeyNotConfigured);
      expect(rootError.retryable).toBe(false);
      expect(rootError.message).not.toContain("binding unavailable");
    }
  });
});

describe("createKeyringFromSecretsStoreBinding", () => {
  it("fails closed when the binding is missing", () => {
    expect(() =>
      createKeyringFromSecretsStoreBinding(
        undefined,
        new WrappedDefaultTenantDataKeySource(new StaticRootKeyProvider(new Uint8Array(32))),
      ),
    ).toThrow(RootKeyNotConfiguredError);
  });

  it("encrypts and decrypts through the binding-backed keyring", async () => {
    const rootKeyProvider = new SecretsStoreRootKeyProvider(
      fakeBinding(() => Promise.resolve(durableTestRootKeyHex())),
    );
    const keyring = createKeyringFromSecretsStoreBinding(
      fakeBinding(() => Promise.resolve(durableTestRootKeyHex())),
      new WrappedDefaultTenantDataKeySource(rootKeyProvider),
    );

    const plaintext = new TextEncoder().encode("binding-backed");
    const wrapped = await encryptSecretValue(keyring, identity, plaintext);
    const decrypted = await decryptSecretValueForRuntime(keyring, identity, wrapped);
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
  });
});
