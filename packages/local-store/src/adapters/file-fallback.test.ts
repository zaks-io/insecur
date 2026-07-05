import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFileFallbackAdapter, writePrivateKeyFile } from "./file-fallback.js";
import { FILE_FALLBACK_NOTICE } from "../notices.js";
import type { KeyStoreDependencies } from "../types.js";

const FAKE_KEY_HEX = "ab".repeat(32);
const deterministicRandomBytes = () => new Uint8Array(32).fill(0xab);

describe("file fallback adapter", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir !== "") {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  function createDeps(): KeyStoreDependencies {
    tempDir = path.join(os.tmpdir(), `insecur-local-store-${String(Date.now())}`);
    return {
      execFile: () => Promise.resolve({ stdout: "", stderr: "" }),
      platform: "linux",
      env: {},
      randomBytes: deterministicRandomBytes,
      paths: {
        userConfigDir: tempDir,
        machineRootKeyFilePath: path.join(tempDir, "machine-root-key"),
        machineRootKeyDpapiFilePath: path.join(tempDir, "machine-root-key.dpapi"),
      },
    };
  }

  it("creates a 0600 key file and returns the generated key", async () => {
    const adapter = createFileFallbackAdapter(createDeps());
    const keyHex = await adapter.getOrCreateMachineRootKey();
    expect(keyHex).toBe(FAKE_KEY_HEX);
    expect(adapter.notice).toEqual(FILE_FALLBACK_NOTICE);

    const filePath = path.join(tempDir, "machine-root-key");
    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(await readFile(filePath, "utf8")).toBe(FAKE_KEY_HEX);
  });

  it("reuses an existing key file", async () => {
    const deps = createDeps();
    await mkdir(tempDir, { recursive: true });
    const existing = "cd".repeat(32);
    const filePath = path.join(tempDir, "machine-root-key");
    await writePrivateKeyFile(filePath, existing);

    const adapter = createFileFallbackAdapter(deps);
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(existing);
  });
});
