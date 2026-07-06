import { describe, expect, it } from "vitest";

import { createLinuxSecretToolAdapter } from "./linux-secret-tool.js";
import type { ExecFileFn, KeyStoreDependencies } from "../types.js";

const FAKE_KEY_HEX = "ab".repeat(32);
const deterministicRandomBytes = () => new Uint8Array(32).fill(0xab);

function createDeps(execFile: ExecFileFn): KeyStoreDependencies {
  return {
    execFile,
    platform: "linux",
    env: { PATH: "/usr/bin" },
    randomBytes: deterministicRandomBytes,
    paths: {
      userConfigDir: "/tmp/insecur-test",
      machineRootKeyFilePath: "/tmp/insecur-test/machine-root-key",
      machineRootKeyDpapiFilePath: "/tmp/insecur-test/machine-root-key.dpapi",
    },
  };
}

describe("linux secret-tool adapter", () => {
  it("returns an existing key from secret-tool lookup", async () => {
    const existing = "cd".repeat(32);
    const execFile: ExecFileFn = (file, args) => {
      expect(file).toBe("secret-tool");
      expect(args).toEqual(["lookup", "service", "insecur", "account", "machine-root-key-v1"]);
      return Promise.resolve({ stdout: `${existing}\n`, stderr: "" });
    };

    const adapter = createLinuxSecretToolAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(existing);
  });

  it("stores via secret-tool stdin and re-reads the persisted key", async () => {
    const calls: { file: string; args: readonly string[]; input?: string }[] = [];
    let lookupCount = 0;
    const execFile: ExecFileFn = (file, args, options) => {
      if (typeof options?.input === "string") {
        calls.push({ file, args, input: options.input });
      } else {
        calls.push({ file, args });
      }
      if (args[0] === "lookup") {
        lookupCount += 1;
        if (lookupCount <= 2) {
          const error = new Error("missing") as NodeJS.ErrnoException & { stderr?: string };
          error.stderr = "No matching results";
          return Promise.reject(error);
        }
        return Promise.resolve({ stdout: `${FAKE_KEY_HEX}\n`, stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    };

    const adapter = createLinuxSecretToolAdapter(
      createDeps(execFile),
      "insecur",
      "machine-root-key-v1",
    );
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(FAKE_KEY_HEX);
    expect(calls[2]?.args[0]).toBe("store");
    expect(calls[2]?.input).toBe(FAKE_KEY_HEX);
    expect(calls[3]?.args[0]).toBe("lookup");
  });
});
