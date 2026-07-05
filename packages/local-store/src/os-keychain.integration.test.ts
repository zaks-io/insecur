import { accessSync, constants as fsConstants } from "node:fs";

import { describe, expect, it } from "vitest";

import { createKeyStore } from "./key-store.js";
import { isLinuxSecretToolAvailable } from "./resolve-backend.js";

const FAKE_KEY_HEX = "ab".repeat(32);

function platformAdapterAvailable(): boolean {
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
      return isLinuxSecretToolAvailable(process.env);
    default:
      return false;
  }
}

describe("OS keychain integration", () => {
  it("round-trips a machine root key through the selected OS adapter", async () => {
    if (!platformAdapterAvailable()) {
      return;
    }

    const configHome = `${process.env.INSECUR_CONFIG_HOME ?? "/tmp"}/insecur-keystore-integration-${String(Date.now())}`;
    const randomBytes = () => new Uint8Array(32).fill(0xab);
    const keyStore = createKeyStore({ configHome, randomBytes });
    if (keyStore.backend === "file-fallback") {
      return;
    }

    const first = await keyStore.getOrCreateMachineRootKey();
    const second = await createKeyStore({ configHome, randomBytes }).getOrCreateMachineRootKey();
    expect(first).toBe(FAKE_KEY_HEX);
    expect(second).toBe(FAKE_KEY_HEX);
    expect(first).toHaveLength(64);
  });
});
