import {
  CRYPTO_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  createKeyringFromDevEnvRootKey,
  EnvRootKeyProvider,
  readInstanceRootKeyHexFromProcessEnv,
  requireKeyring,
  resolveInstanceRootKeyFromEnv,
} from "../src/crypto-runtime.js";
import { DecryptError, RootKeyNotConfiguredError } from "../src/errors.js";
import {
  decryptSecretValueForRuntime,
  encryptSecretValue,
  type SecretCiphertextIdentity,
} from "../src/encryption.js";
import { createKeyring } from "../src/keyring.js";

const identity: SecretCiphertextIdentity = {
  organizationId: organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
  projectId: projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W"),
  environmentId: environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y"),
  secretId: secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A"),
};

function durableTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = index + 1;
  }
  return root;
}

function durableTestRootKeyHex(): string {
  return Array.from(durableTestRootKey(), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function differentTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = 255 - index;
  }
  return root;
}

function setEnvRootKeyHex(hex: string | undefined): () => void {
  const previous = process.env.INSECUR_INSTANCE_ROOT_KEY_HEX;
  if (hex === undefined) {
    Reflect.deleteProperty(process.env, "INSECUR_INSTANCE_ROOT_KEY_HEX");
  } else {
    process.env.INSECUR_INSTANCE_ROOT_KEY_HEX = hex;
  }

  return () => {
    if (previous === undefined) {
      Reflect.deleteProperty(process.env, "INSECUR_INSTANCE_ROOT_KEY_HEX");
    } else {
      process.env.INSECUR_INSTANCE_ROOT_KEY_HEX = previous;
    }
  };
}

describe("crypto runtime keyring resolution", () => {
  it("fails closed when a request does not supply a keyring", () => {
    expect(() => requireKeyring(undefined)).toThrow(RootKeyNotConfiguredError);
  });

  it("returns only the caller-supplied keyring without retaining prior requests", () => {
    const first = createKeyring(durableTestRootKey());
    const second = createKeyring(differentTestRootKey());

    expect(requireKeyring(first)).toBe(first);
    expect(requireKeyring(second)).toBe(second);
  });

  it("does not fall back to the environment root key", () => {
    const restore = setEnvRootKeyHex(durableTestRootKeyHex());
    try {
      expect(() => requireKeyring(undefined)).toThrow(RootKeyNotConfiguredError);
    } finally {
      restore();
    }
  });

  it("keeps key material scoped to explicit keyring instances", async () => {
    const requestRoot = durableTestRootKey();
    const wrapped = await encryptSecretValue(
      createKeyring(requestRoot),
      identity,
      new TextEncoder().encode("value"),
    );

    await expect(
      decryptSecretValueForRuntime(createKeyring(differentTestRootKey()), identity, wrapped),
    ).rejects.toBeInstanceOf(DecryptError);

    const decrypted = await decryptSecretValueForRuntime(
      createKeyring(requestRoot),
      identity,
      wrapped,
    );
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe("value");
  });
});

describe("ADR-0064 env root key fallback", () => {
  it("refuses production resolution even when env hex is present", () => {
    expect(() =>
      resolveInstanceRootKeyFromEnv({
        runtimeMode: "production",
        envHex: durableTestRootKeyHex(),
      }),
    ).toThrow(RootKeyNotConfiguredError);
  });

  it("refuses production resolution when process env is populated", () => {
    const restore = setEnvRootKeyHex(durableTestRootKeyHex());
    try {
      expect(() =>
        resolveInstanceRootKeyFromEnv({
          runtimeMode: "production",
          envHex: readInstanceRootKeyHexFromProcessEnv(),
        }),
      ).toThrow(RootKeyNotConfiguredError);
    } finally {
      restore();
    }
  });

  it("allows development resolution from explicit env hex", () => {
    const bytes = resolveInstanceRootKeyFromEnv({
      runtimeMode: "development",
      envHex: durableTestRootKeyHex(),
    });
    expect(bytes).toEqual(durableTestRootKey());
  });

  it("allows development resolution from process env", () => {
    const restore = setEnvRootKeyHex(durableTestRootKeyHex());
    try {
      const bytes = resolveInstanceRootKeyFromEnv({
        runtimeMode: "development",
        envHex: readInstanceRootKeyHexFromProcessEnv(),
      });
      expect(bytes).toEqual(durableTestRootKey());
    } finally {
      restore();
    }
  });

  it("fails closed in development when env hex is missing or invalid", () => {
    expect(() =>
      resolveInstanceRootKeyFromEnv({
        runtimeMode: "development",
        envHex: undefined,
      }),
    ).toThrow(RootKeyNotConfiguredError);

    expect(() =>
      resolveInstanceRootKeyFromEnv({
        runtimeMode: "development",
        envHex: "not-a-root-key",
      }),
    ).toThrow(RootKeyNotConfiguredError);
  });

  it("EnvRootKeyProvider refuses production at first use", async () => {
    const provider = new EnvRootKeyProvider("production", durableTestRootKeyHex());
    await expect(provider.getRootKeyBytes(1)).rejects.toBeInstanceOf(RootKeyNotConfiguredError);
  });

  it("EnvRootKeyProvider resolves in development", async () => {
    const provider = new EnvRootKeyProvider("development", durableTestRootKeyHex());
    await expect(provider.getRootKeyBytes(1)).resolves.toEqual(durableTestRootKey());
  });

  it("createKeyringFromDevEnvRootKey works in development and refuses production", () => {
    expect(() => createKeyringFromDevEnvRootKey("production", durableTestRootKeyHex())).toThrow(
      RootKeyNotConfiguredError,
    );

    const keyring = createKeyringFromDevEnvRootKey("development", durableTestRootKeyHex());
    expect(keyring).toBeDefined();
  });

  it("exposes ErrorBody-compatible production refusal", () => {
    try {
      resolveInstanceRootKeyFromEnv({
        runtimeMode: "production",
        envHex: durableTestRootKeyHex(),
      });
      expect.fail("expected production env refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(RootKeyNotConfiguredError);
      const rootError = error as RootKeyNotConfiguredError;
      expect(rootError.code).toBe(CRYPTO_ERROR_CODES.rootKeyNotConfigured);
      expect(rootError.retryable).toBe(false);
    }
  });
});
