import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants as fsConstants } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as crypto from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createDefaultExecFile } from "./exec-file.js";
import { createKeyStore } from "./key-store.js";
import { isLinuxSecretToolAvailable } from "./resolve-backend.js";
import { resetSingleFlightCacheForTests } from "./serialize-async.js";
import type { KeyStoreBackend } from "./types.js";

const INTEGRATION_OPT_IN_ENV = "INSECUR_LOCAL_STORE_OS_INTEGRATION";
const INTEGRATION_KEY_DIGEST_ENV = "INSECUR_INTEGRATION_KEY_DIGEST";
const INTEGRATION_CONFIG_HOME_ENV = "INSECUR_INTEGRATION_CONFIG_HOME";
const INTEGRATION_SERVICE_ENV = "INSECUR_INTEGRATION_SERVICE";
const INTEGRATION_ACCOUNT_ENV = "INSECUR_INTEGRATION_ACCOUNT";
const packageSrcDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageSrcDir, "../../..");
const integrationChildScript = path.join(packageSrcDir, "os-keychain.integration-child.ts");
const tsxEsmImport = createRequire(path.join(workspaceRoot, "package.json")).resolve("tsx/esm");

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

function digestMachineRootKeyHex(keyHex: string): string {
  return createHash("sha256").update(keyHex, "utf8").digest("hex");
}

async function cleanupIntegrationSlot(
  backend: KeyStoreBackend,
  service: string,
  account: string,
  configHome: string,
): Promise<void> {
  const execFile = createDefaultExecFile();
  try {
    if (backend === "macos-keychain") {
      await execFile("/usr/bin/security", [
        "delete-generic-password",
        "-s",
        service,
        "-a",
        account,
      ]);
      return;
    }
    if (backend === "linux-secret-tool") {
      await execFile("secret-tool", ["clear", "service", service, "account", account]);
      return;
    }
    if (backend === "windows-dpapi") {
      await rm(path.join(configHome, "machine-root-key.dpapi"), { force: true });
    }
  } catch {
    // Best-effort cleanup for opt-in integration runs.
  }
}

function assertChildProcessReadBackMatchesDigest(
  keyStoreOptions: {
    configHome: string;
    service: string;
    account: string;
  },
  expectedDigest: string,
): void {
  const child = spawnSync(process.execPath, ["--import", tsxEsmImport, integrationChildScript], {
    env: {
      ...process.env,
      [INTEGRATION_KEY_DIGEST_ENV]: expectedDigest,
      [INTEGRATION_CONFIG_HOME_ENV]: keyStoreOptions.configHome,
      [INTEGRATION_SERVICE_ENV]: keyStoreOptions.service,
      [INTEGRATION_ACCOUNT_ENV]: keyStoreOptions.account,
    },
    encoding: "utf8",
  });

  expect(child.status).toBe(0);
  expect(child.stdout).toBe("");
  expect(child.stderr).toBe("");
}

describe("OS keychain integration", () => {
  it("round-trips a machine root key through the selected OS adapter", async () => {
    if (!integrationOptInEnabled(process.env)) {
      return;
    }
    if (!platformAdapterAvailable(process.env)) {
      return;
    }

    const service = `insecur-integration-${randomUUID()}`;
    const account = `machine-root-key-${randomUUID()}`;
    const configHome = path.join(
      process.env.INSECUR_CONFIG_HOME ?? "/tmp",
      `insecur-keystore-integration-${randomUUID()}`,
    );
    const keyStoreOptions = {
      configHome,
      service,
      account,
    };
    const keyStore = createKeyStore(keyStoreOptions);
    if (keyStore.backend === "file-fallback") {
      return;
    }

    await mkdir(configHome, { recursive: true });
    const randomBytesSpy = vi.spyOn(crypto, "randomBytes");

    try {
      const first = await keyStore.getOrCreateMachineRootKey();
      expect(randomBytesSpy).toHaveBeenCalledTimes(1);

      resetSingleFlightCacheForTests();
      const sameProcessSecond = await createKeyStore(keyStoreOptions).getOrCreateMachineRootKey();
      expect(sameProcessSecond).toBe(first);
      expect(randomBytesSpy).toHaveBeenCalledTimes(1);

      assertChildProcessReadBackMatchesDigest(keyStoreOptions, digestMachineRootKeyHex(first));
      expect(first).toHaveLength(64);
    } finally {
      randomBytesSpy.mockRestore();
      await cleanupIntegrationSlot(keyStore.backend, service, account, configHome);
      await rm(configHome, { recursive: true, force: true });
    }
  });
});
