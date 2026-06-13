import { CRYPTO_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { RootKeyNotConfiguredError, SecretsStoreRootKeyProvider } from "@insecur/crypto";
import type { SecretsStoreSecretBinding } from "@insecur/crypto";

import { createKeyringFromWorkerEnv, WorkerEnvRootKeyProvider } from "./keyring-context.js";

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

describe("createKeyringFromWorkerEnv", () => {
  it("fails closed when INSTANCE_ROOT_KEY_V1 is missing", () => {
    expect(() =>
      createKeyringFromWorkerEnv({
        WORKOS_API_KEY: "sk_test",
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
        SESSION_SIGNING_SECRET: "session-signing-secret-at-least-32-chars",
      }),
    ).toThrow(RootKeyNotConfiguredError);
  });

  it("builds independent keyrings from a fake Secrets Store binding", () => {
    const binding = fakeBinding(() => Promise.resolve(durableTestRootKeyHex()));
    const env = {
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: "session-signing-secret-at-least-32-chars",
      INSTANCE_ROOT_KEY_V1: binding,
    };

    const first = createKeyringFromWorkerEnv(env);
    const second = createKeyringFromWorkerEnv(env);
    expect(first).not.toBe(second);
  });

  it("surfaces ErrorBody-compatible failures when the root binding rejects", async () => {
    const provider = new SecretsStoreRootKeyProvider(
      fakeBinding(async () => Promise.reject(new Error("secrets store down"))),
    );
    await expect(provider.getRootKeyBytes(1)).rejects.toMatchObject({
      code: CRYPTO_ERROR_CODES.rootKeyNotConfigured,
      retryable: false,
    });
  });

  it("fails closed on root key version mismatch when only INSTANCE_ROOT_KEY_V1 is bound", async () => {
    const provider = new WorkerEnvRootKeyProvider({
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: "session-signing-secret-at-least-32-chars",
      INSTANCE_ROOT_KEY_V1: fakeBinding(() => Promise.resolve(durableTestRootKeyHex())),
    });
    await expect(provider.getRootKeyBytes(2)).rejects.toBeInstanceOf(RootKeyNotConfiguredError);
  });
});
