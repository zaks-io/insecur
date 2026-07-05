import { describe, expect, it } from "vitest";

import { DEFAULT_EXEC_FILE_TIMEOUT_MS } from "./exec-file.js";
import type { ExecFileFn } from "./types.js";

describe("createDefaultExecFile", () => {
  it("defines a bounded default child process timeout", () => {
    expect(DEFAULT_EXEC_FILE_TIMEOUT_MS).toBe(30_000);
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
});
