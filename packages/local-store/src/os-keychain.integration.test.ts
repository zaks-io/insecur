import { accessSync, constants as fsConstants } from "node:fs";

import { describe, expect, it } from "vitest";

import { createKeyStore } from "./key-store.js";
import { isLinuxSecretToolAvailable } from "./resolve-backend.js";

const INTEGRATION_OPT_IN_ENV = "INSECUR_LOCAL_STORE_OS_INTEGRATION";
const INTEGRATION_SERVICE = "insecur-integration-test";
const INTEGRATION_ACCOUNT = "machine-root-key-integration-v1";
const FAKE_KEY_HEX = "ab".repeat(32);

function integrationOptInEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[INTEGRATION_OPT_IN_ENV] === "1";
}

function platformAdapterAvailable(env: NodeJS.ProcessEnv): boolean {
  switch (process.platform) {
    case "darwin":
      try {
        accessSync("/usr/bin/security", fsConstants.X_OK);
        return true;
      } catch {
        return false;
      }
    case "win32":
      return true;
    case "linux":
      return isLinuxSecretToolAvailable(env);
    default:
      return false;
  }
}

describe("OS keychain integration", () => {
  it("round-trips a machine root key through the selected OS adapter", async () => {
    if (!integrationOptInEnabled(process.env)) {
      return;
    }
    if (!platformAdapterAvailable(process.env)) {
      return;
    }

    const configHome = `${process.env.INSECUR_CONFIG_HOME ?? "/tmp"}/insecur-keystore-integration-${String(Date.now())}`;
    const randomBytes = () => new Uint8Array(32).fill(0xab);
    const keyStoreOptions = {
      configHome,
      randomBytes,
      service: INTEGRATION_SERVICE,
      account: INTEGRATION_ACCOUNT,
    };
    const keyStore = createKeyStore(keyStoreOptions);
    if (keyStore.backend === "file-fallback") {
      return;
    }

    const first = await keyStore.getOrCreateMachineRootKey();
    const second = await createKeyStore(keyStoreOptions).getOrCreateMachineRootKey();
    expect(first).toBe(FAKE_KEY_HEX);
    expect(second).toBe(FAKE_KEY_HEX);
    expect(first).toHaveLength(64);
  });
});
