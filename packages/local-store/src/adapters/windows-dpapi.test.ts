import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWindowsDpapiAdapter } from "./windows-dpapi.js";
import type { ExecFileFn, KeyStoreDependencies } from "../types.js";

const FAKE_KEY_HEX = "ab".repeat(32);
const deterministicRandomBytes = () => new Uint8Array(32).fill(0xab);

describe("windows DPAPI adapter", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir !== "") {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  async function createDeps(execFile: ExecFileFn): Promise<KeyStoreDependencies> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-dpapi-"));
    return {
      execFile,
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      randomBytes: deterministicRandomBytes,
      paths: {
        userConfigDir: tempDir,
        machineRootKeyFilePath: path.join(tempDir, "machine-root-key"),
        machineRootKeyDpapiFilePath: path.join(tempDir, "machine-root-key.dpapi"),
      },
    };
  }

  it("invokes powershell.exe with argv arrays and stdin for protect, then re-reads", async () => {
    let protectInput = "";
    let protectCalls = 0;
    const execFile: ExecFileFn = (file, args, options) => {
      expect(file).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      expect(args[0]).toBe("-NoProfile");
      if (typeof options?.input === "string") {
        protectInput = options.input;
        protectCalls += 1;
        return mkdir(tempDir, { recursive: true })
          .then(() =>
            writeFile(path.join(tempDir, "machine-root-key.dpapi"), "protected-blob", "utf8"),
          )
          .then(() => ({ stdout: "", stderr: "" }));
      }
      return Promise.resolve({ stdout: "cd".repeat(32), stderr: "" });
    };

    const deps = await createDeps(execFile);
    const adapter = createWindowsDpapiAdapter(deps);
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe("cd".repeat(32));
    expect(protectInput).toBe(FAKE_KEY_HEX);
    expect(protectCalls).toBe(1);
  });

  it("reads an existing DPAPI blob through powershell unprotect", async () => {
    const existing = "cd".repeat(32);
    const execFile: ExecFileFn = (file, args) => {
      expect(file).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      expect(args).toContain("-Path");
      return Promise.resolve({ stdout: existing, stderr: "" });
    };

    const deps = await createDeps(execFile);
    await writeFile(path.join(tempDir, "machine-root-key.dpapi"), "protected-blob", "utf8");
    const adapter = createWindowsDpapiAdapter(deps);
    await expect(adapter.getOrCreateMachineRootKey()).resolves.toBe(existing);
    await expect(readFile(path.join(tempDir, "machine-root-key.dpapi"), "utf8")).resolves.toBe(
      "protected-blob",
    );
  });
});
