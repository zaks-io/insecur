import { describe, expect, it } from "vitest";

import { createMacosKeychainAdapter } from "./macos-keychain.js";
import { KEY_STORE_ERROR_CODES } from "../errors.js";
import type { ExecFileFn, KeyStoreDependencies } from "../types.js";

const FAKE_KEY_HEX = "ab".repeat(32);
const deterministicRandomBytes = () => new Uint8Array(32).fill(0xab);

function createDeps(execFile: ExecFileFn): KeyStoreDependencies {
  return {
    execFile,
    platform: "darwin",
    env: {},
    randomBytes: deterministicRandomBytes,
    paths: {
      userConfigDir: "/tmp/insecur-test",
      machineRootKeyFilePath: "/tmp/insecur-test/machine-root-key",
      machineRootKeyDpapiFilePath: "/tmp/insecur-test/machine-root-key.dpapi",
    },
  };
}

describe("macOS keychain adapter", () => {
  it("returns an existing key from find-generic-password", async () => {
    const existing = "cd".repeat(32);
    const execFile: ExecFileFn = (file, args) => {
      expect(file).toBe("/usr/bin/security");
      expect(args).toEqual([
        "find-generic-password",
        "-s",
        "insecur",
        "-a",
        "machine-root-key-v1",
        "-w",
      ]);
      return Promise.resolve({ stdout: `${existing}\n`, stderr: "" });
    };

    const adapter = createMacosKeychainAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(existing);
  });

  it("stores with create-only argv arrays and re-reads the persisted key", async () => {
    const calls: { file: string; args: readonly string[] }[] = [];
    let lookupCount = 0;
    const execFile: ExecFileFn = (file, args) => {
      calls.push({ file, args });
      if (args[0] === "find-generic-password") {
        lookupCount += 1;
        if (lookupCount <= 2) {
          const error = new Error("not found") as NodeJS.ErrnoException & { stderr?: string };
          error.stderr = "The specified item could not be found in the keychain.";
          return Promise.reject(error);
        }
        return Promise.resolve({ stdout: `${FAKE_KEY_HEX}\n`, stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    };

    const adapter = createMacosKeychainAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(FAKE_KEY_HEX);
    expect(calls).toHaveLength(4);
    expect(calls[2]).toEqual({
      file: "/usr/bin/security",
      args: [
        "add-generic-password",
        "-s",
        "insecur",
        "-a",
        "machine-root-key-v1",
        "-w",
        FAKE_KEY_HEX,
      ],
    });
  });

  it("does not attach raw child-process causes on sensitive store failures", async () => {
    const sensitiveKey = FAKE_KEY_HEX;
    const execFile: ExecFileFn = (file, args) => {
      if (args[0] === "find-generic-password") {
        const error = new Error("not found") as NodeJS.ErrnoException & { stderr?: string };
        error.stderr = "The specified item could not be found in the keychain.";
        return Promise.reject(error);
      }
      const raw = new Error(
        `Command failed: /usr/bin/security add-generic-password -w ${sensitiveKey}`,
      ) as NodeJS.ErrnoException & { cmd?: string };
      raw.code = "ERR_CHILD_PROCESS_FAILED";
      raw.cmd = `/usr/bin/security add-generic-password -w ${sensitiveKey}`;
      return Promise.reject(raw);
    };

    const adapter = createMacosKeychainAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    const error = await adapter.getOrCreateMachineRootKey().catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: KEY_STORE_ERROR_CODES.adapterFailed,
      message: "macOS keychain store failed",
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toBeUndefined();
    expect(String(error)).not.toContain(sensitiveKey);
  });

  it("propagates exec maxBuffer failures instead of storing a replacement key", async () => {
    const execFile: ExecFileFn = () => {
      const error = new Error("maxBuffer exceeded") as NodeJS.ErrnoException;
      error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
      return Promise.reject(error);
    };

    const adapter = createMacosKeychainAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    await expect(adapter.getOrCreateMachineRootKey()).rejects.toMatchObject({
      code: KEY_STORE_ERROR_CODES.adapterFailed,
    });
  });
});
