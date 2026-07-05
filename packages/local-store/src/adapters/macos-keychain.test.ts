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

  it("stores a generated key with add-generic-password argv arrays", async () => {
    const calls: { file: string; args: readonly string[] }[] = [];
    const execFile: ExecFileFn = (file, args) => {
      calls.push({ file, args });
      if (args[0] === "find-generic-password") {
        const error = new Error("not found") as NodeJS.ErrnoException & { stderr?: string };
        error.stderr = "The specified item could not be found in the keychain.";
        return Promise.reject(error);
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    };

    const adapter = createMacosKeychainAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(FAKE_KEY_HEX);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      file: "/usr/bin/security",
      args: [
        "add-generic-password",
        "-U",
        "-s",
        "insecur",
        "-a",
        "machine-root-key-v1",
        "-w",
        FAKE_KEY_HEX,
      ],
    });
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
