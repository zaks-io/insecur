import { CRYPTO_ERROR_CODES, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { RootKeyNotConfiguredError } from "@insecur/crypto";
import type { SecretsStoreSecretBinding } from "@insecur/crypto";

import { createKeyringFromWorkerEnv } from "./keyring-context.js";

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
  it("fails closed when INSTANCE_ROOT_KEY is missing", () => {
    expect(() =>
      createKeyringFromWorkerEnv({
        WORKOS_API_KEY: "sk_test",
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
        SESSION_SIGNING_SECRET: "session-signing-secret-at-least-32-chars",
      }),
    ).toThrow(RootKeyNotConfiguredError);
  });

  it("builds a keyring from a fake Secrets Store binding without module-level caching", async () => {
    let getCalls = 0;
    const binding = fakeBinding(() => {
      getCalls += 1;
      return Promise.resolve(durableTestRootKeyHex());
    });

    const env = {
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: "session-signing-secret-at-least-32-chars",
      INSTANCE_ROOT_KEY: binding,
    };

    const first = createKeyringFromWorkerEnv(env);
    const second = createKeyringFromWorkerEnv(env);
    expect(first).not.toBe(second);

    const org = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    const project = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
    const versions = { organizationDataKeyVersion: 1, projectDataKeyVersion: 1 };

    await first.getProjectDataKey(org, project, versions);
    await second.getProjectDataKey(org, project, versions);
    // Wrapped data keys resolve the root per mint/unwrap step; two keyrings still fetch independently.
    expect(getCalls).toBe(5);
  });

  it("surfaces ErrorBody-compatible failures for rejected binding reads", async () => {
    const env = {
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: "session-signing-secret-at-least-32-chars",
      INSTANCE_ROOT_KEY: fakeBinding(async () => Promise.reject(new Error("secrets store down"))),
    };

    const keyring = createKeyringFromWorkerEnv(env);
    await expect(
      keyring.getProjectDataKey(
        organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
        projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W"),
        { organizationDataKeyVersion: 1, projectDataKeyVersion: 1 },
      ),
    ).rejects.toMatchObject({
      code: CRYPTO_ERROR_CODES.rootKeyNotConfigured,
      retryable: false,
    });
  });
});
