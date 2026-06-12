import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configureKeyring, resetKeyringForTests } from "../src/crypto-runtime.js";
import { RootKeyNotConfiguredError } from "../src/errors.js";
import {
  decryptSecretValueForRuntime,
  encryptSecretValue,
  type SecretCiphertextIdentity,
} from "../src/encryption.js";
import { createKeyring } from "../src/keyring.js";

const ENV_ROOT_KEY = "INSECUR_INSTANCE_ROOT_KEY_HEX";

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

describe("crypto runtime root key readiness", () => {
  let previousEnvRoot: string | undefined;

  beforeEach(() => {
    previousEnvRoot = process.env[ENV_ROOT_KEY];
    resetKeyringForTests();
    process.env[ENV_ROOT_KEY] = "";
  });

  afterEach(() => {
    resetKeyringForTests();
    if (previousEnvRoot === undefined) {
      process.env[ENV_ROOT_KEY] = "";
    } else {
      process.env[ENV_ROOT_KEY] = previousEnvRoot;
    }
  });

  it("rejects encrypt when no root key is configured", async () => {
    await expect(
      encryptSecretValue(identity, new TextEncoder().encode("value")),
    ).rejects.toBeInstanceOf(RootKeyNotConfiguredError);
  });

  it("rejects decrypt when no root key is configured", async () => {
    const durableRoot = durableTestRootKey();
    configureKeyring(createKeyring(durableRoot));
    const wrapped = await encryptSecretValue(identity, new TextEncoder().encode("value"));

    resetKeyringForTests();

    await expect(decryptSecretValueForRuntime(identity, wrapped)).rejects.toBeInstanceOf(
      RootKeyNotConfiguredError,
    );
  });

  it("decrypts after keyring reset when the same durable root is reconfigured", async () => {
    const durableRoot = durableTestRootKey();
    configureKeyring(createKeyring(durableRoot));
    const plaintext = new TextEncoder().encode("survives-reset");
    const wrapped = await encryptSecretValue(identity, plaintext);

    resetKeyringForTests();
    configureKeyring(createKeyring(durableRoot));

    const decrypted = await decryptSecretValueForRuntime(identity, wrapped);
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
  });

  it("uses a durable env root across keyring reset", async () => {
    const durableRoot = durableTestRootKey();
    process.env[ENV_ROOT_KEY] = Array.from(durableRoot, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    const plaintext = new TextEncoder().encode("env-root");
    const wrapped = await encryptSecretValue(identity, plaintext);

    resetKeyringForTests();

    const decrypted = await decryptSecretValueForRuntime(identity, wrapped);
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe(
      new TextDecoder().decode(plaintext),
    );
  });
});
