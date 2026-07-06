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

  it("writes stdin to argv-only child processes without shell strings", async () => {
    const run = createDefaultExecFile();
    const marker = "stdin-marker-payload";
    const result = await run(
      process.execPath,
      [
        "-e",
        "let body='';process.stdin.on('data',(chunk)=>{body+=chunk});process.stdin.on('end',()=>{process.stdout.write(String(body.length))});",
      ],
      { input: marker, timeoutMs: 5_000 },
    );
    expect(result.stdout).toBe(String(marker.length));
    expect(result.stderr).toBe("");
  });

  it("sanitizes stdin child process failures without echoing input", async () => {
    const run = createDefaultExecFile();
    const marker = "stdin-marker-payload";
    await expect(
      run(process.execPath, ["-e", "process.exit(2)"], { input: marker, timeoutMs: 5_000 }),
    ).rejects.toMatchObject({
      message: "child process execFile failed",
      code: 2,
    });
    await expect(
      run(process.execPath, ["-e", "process.exit(2)"], { input: marker, timeoutMs: 5_000 }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof Error)) {
        return true;
      }
      const leakSurface = `${error.message}\n${error.stack ?? ""}`;
      return !leakSurface.includes(marker);
    });
  });

  it("preserves sanitized stderr diagnostics from stdin child process failures", async () => {
    const run = createDefaultExecFile();
    const diagnostic = "adapter-diagnostic-message";
    await expect(
      run(
        process.execPath,
        ["-e", `console.error(${JSON.stringify(diagnostic)});process.exit(3)`],
        {
          input: "stdin-marker-payload",
          timeoutMs: 5_000,
        },
      ),
    ).rejects.toMatchObject({
      message: "child process execFile failed",
      code: 3,
      stderr: `${diagnostic}\n`,
    });
  });

  it("enforces maxBuffer on stderr for stdin child processes", async () => {
    const run = createDefaultExecFile();
    await expect(
      run(
        process.execPath,
        ["-e", "process.stderr.write('x'.repeat(2048));process.stdin.resume();"],
        { input: "stdin-marker-payload", maxBuffer: 128, timeoutMs: 5_000 },
      ),
    ).rejects.toMatchObject({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
  });
});
