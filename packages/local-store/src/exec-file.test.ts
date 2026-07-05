import { describe, expect, it } from "vitest";

import {
  buildNodeExecFileOptions,
  createDefaultExecFile,
  DEFAULT_EXEC_FILE_TIMEOUT_MS,
  resolveExecFileOptions,
} from "./exec-file.js";
import type { ExecFileFn } from "./types.js";

describe("createDefaultExecFile", () => {
  it("defines a bounded default child process timeout", () => {
    expect(DEFAULT_EXEC_FILE_TIMEOUT_MS).toBe(30_000);
  });

  it("maps ExecFileOptions.timeoutMs to node child process timeout", () => {
    expect(buildNodeExecFileOptions()).toMatchObject({ timeout: DEFAULT_EXEC_FILE_TIMEOUT_MS });
    expect(buildNodeExecFileOptions({ timeoutMs: 5_000 })).toMatchObject({ timeout: 5_000 });
  });

  it("defaults timeoutMs before adapters call execFile without options", () => {
    expect(resolveExecFileOptions()).toEqual({ timeoutMs: DEFAULT_EXEC_FILE_TIMEOUT_MS });
    expect(resolveExecFileOptions({ maxBuffer: 2048 })).toEqual({
      timeoutMs: DEFAULT_EXEC_FILE_TIMEOUT_MS,
      maxBuffer: 2048,
    });
    expect(resolveExecFileOptions({ timeoutMs: 1_000 })).toEqual({ timeoutMs: 1_000 });
  });

  it("forwards timeoutMs through the ExecFileFn options contract", async () => {
    let observedTimeoutMs: number | undefined;
    const execFile: ExecFileFn = (_file, _args, options) => {
      observedTimeoutMs = options?.timeoutMs;
      return Promise.resolve({ stdout: "", stderr: "" });
    };

    await execFile("secret-tool", ["lookup"], { timeoutMs: 12_345 });
    expect(observedTimeoutMs).toBe(12_345);
  });

  it("terminates hung child processes using the configured timeout", async () => {
    const run = createDefaultExecFile();
    await expect(
      run(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], { timeoutMs: 100 }),
    ).rejects.toMatchObject({ killed: true });
  });
});
