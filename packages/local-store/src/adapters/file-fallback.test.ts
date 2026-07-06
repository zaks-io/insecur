import { access, mkdtemp, open, readFile, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFileFallbackAdapter,
  ensurePrivateKeyDirectory,
  writePrivateKeyFile,
  writePrivateKeyFileExclusive,
} from "./file-fallback.js";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
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

  async function createDeps(
    randomBytes: (size: number) => Uint8Array = deterministicRandomBytes,
  ): Promise<KeyStoreDependencies> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-local-store-"));
    return {
      execFile: () => Promise.resolve({ stdout: "", stderr: "" }),
      platform: "linux",
      env: {},
      randomBytes,
      paths: {
        userConfigDir: tempDir,
        machineRootKeyFilePath: path.join(tempDir, "machine-root-key"),
        machineRootKeyDpapiFilePath: path.join(tempDir, "machine-root-key.dpapi"),
      },
    };
  }

  it("creates a 0600 key file and a 0700 parent directory", async () => {
    const adapter = createFileFallbackAdapter(await createDeps());
    const keyHex = await adapter.getOrCreateMachineRootKey();
    expect(keyHex).toBe(FAKE_KEY_HEX);
    expect(adapter.notice).toEqual(FILE_FALLBACK_NOTICE);

    const filePath = path.join(tempDir, "machine-root-key");
    const fileStat = await stat(filePath);
    const dirStat = await stat(tempDir);
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(dirStat.mode & 0o777).toBe(0o700);
    expect(await readFile(filePath, "utf8")).toBe(FAKE_KEY_HEX);
  });

  it("reuses an existing key file", async () => {
    const deps = await createDeps();
    const existing = "cd".repeat(32);
    const filePath = path.join(tempDir, "machine-root-key");
    await writePrivateKeyFile(filePath, existing);

    const adapter = createFileFallbackAdapter(deps);
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(existing);
  });

  it("removes a partial key file when exclusive create fails after open", async () => {
    await createDeps();
    const filePath = path.join(tempDir, "machine-root-key");
    const probePath = path.join(tempDir, "probe");
    const probe = await open(probePath, "wx");
    const fileHandleProto = Object.getPrototypeOf(probe) as {
      writeFile: (typeof probe)["writeFile"];
    };
    await probe.close();
    await unlink(probePath);

    const originalWriteFile = fileHandleProto.writeFile;
    fileHandleProto.writeFile = vi
      .fn()
      .mockRejectedValueOnce(new Error("write failed")) as (typeof probe)["writeFile"];

    try {
      await expect(writePrivateKeyFileExclusive(filePath, FAKE_KEY_HEX)).rejects.toThrow(
        "write failed",
      );
      await expect(access(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      fileHandleProto.writeFile = originalWriteFile;
    }
  });

  it("returns the persisted key when exclusive create loses a race", async () => {
    const deps = await createDeps();
    const filePath = path.join(tempDir, "machine-root-key");
    const existing = "cd".repeat(32);
    await writePrivateKeyFile(filePath, existing);

    const outcome = await writePrivateKeyFileExclusive(filePath, FAKE_KEY_HEX);
    expect(outcome).toBe("exists");
    expect(await readFile(filePath, "utf8")).toBe(existing);

    const adapter = createFileFallbackAdapter(deps);
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(existing);
  });

  it("fails lookup on unreadable key material", async () => {
    const deps = await createDeps();
    const filePath = path.join(tempDir, "machine-root-key");
    await ensurePrivateKeyDirectory(tempDir);
    await writePrivateKeyFile(filePath, "not-valid-hex");

    const adapter = createFileFallbackAdapter(deps);
    await expect(adapter.getOrCreateMachineRootKey()).rejects.toMatchObject({
      code: KEY_STORE_ERROR_CODES.invalidMaterial,
    });
  });

  it("wraps exclusive create failures in KeyStoreError", async () => {
    const deps = await createDeps();
    const blockingPath = path.join(tempDir, "blocked");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(blockingPath, "blocker", "utf8");
    const brokenDeps: KeyStoreDependencies = {
      ...deps,
      paths: {
        ...deps.paths,
        machineRootKeyFilePath: path.join(blockingPath, "machine-root-key"),
      },
    };

    const adapter = createFileFallbackAdapter(brokenDeps);
    await expect(adapter.getOrCreateMachineRootKey()).rejects.toMatchObject({
      code: KEY_STORE_ERROR_CODES.adapterFailed,
    });
  });

  it("preserves adapter failure causes on KeyStoreError", () => {
    const cause = new Error("mkdir failed");
    const error = new KeyStoreError(
      KEY_STORE_ERROR_CODES.adapterFailed,
      "file fallback key store failed",
      {
        cause,
      },
    );
    expect(error.cause).toBe(cause);
  });
});
