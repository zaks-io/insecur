import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { requireKeyring } from "../src/crypto-runtime.js";
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

function differentTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = 255 - index;
  }
  return root;
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
    const previous = process.env.INSECUR_INSTANCE_ROOT_KEY_HEX;
    process.env.INSECUR_INSTANCE_ROOT_KEY_HEX = Array.from(durableTestRootKey(), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    try {
      expect(() => requireKeyring(undefined)).toThrow(RootKeyNotConfiguredError);
    } finally {
      if (previous === undefined) {
        delete process.env.INSECUR_INSTANCE_ROOT_KEY_HEX;
      } else {
        process.env.INSECUR_INSTANCE_ROOT_KEY_HEX = previous;
      }
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
