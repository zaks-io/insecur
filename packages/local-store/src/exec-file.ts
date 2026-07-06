import type { ExecFileOptionsWithStringEncoding } from "node:child_process";
import { execFile as nodeExecFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { sanitizeChildProcessFailureCause } from "./exec-file-error.js";
import type { ExecFileFn, ExecFileOptions as KeyStoreExecFileOptions } from "./types.js";

export const DEFAULT_EXEC_FILE_TIMEOUT_MS = 30_000;

type NodeExecFileOptions = ExecFileOptionsWithStringEncoding;

interface ChildProcessFailureExtras {
  readonly killed?: boolean;
  readonly signal?: NodeJS.Signals | null;
  readonly code?: number | null;
}

function applyOptionalExecFileFields(
  nodeOptions: NodeExecFileOptions,
  options?: KeyStoreExecFileOptions,
): void {
  if (options?.env !== undefined) {
    nodeOptions.env = options.env;
  }
  if (options?.windowsHide !== undefined) {
    nodeOptions.windowsHide = options.windowsHide;
  }
}

export function resolveExecFileOptions(options?: KeyStoreExecFileOptions): KeyStoreExecFileOptions {
  return {
    timeoutMs: DEFAULT_EXEC_FILE_TIMEOUT_MS,
    ...options,
  };
}

export function buildNodeExecFileOptions(options?: KeyStoreExecFileOptions): NodeExecFileOptions {
  const resolvedOptions = resolveExecFileOptions(options);
  const nodeOptions: NodeExecFileOptions = {
    encoding: "utf8",
    maxBuffer: resolvedOptions.maxBuffer ?? 1024,
    timeout: resolvedOptions.timeoutMs ?? DEFAULT_EXEC_FILE_TIMEOUT_MS,
  };
  applyOptionalExecFileFields(nodeOptions, resolvedOptions);
  return nodeOptions;
}

function applyChildProcessFailureExtras(error: Error, extras?: ChildProcessFailureExtras): Error {
  if (extras?.killed !== undefined) {
    (error as NodeJS.ErrnoException & { killed?: boolean }).killed = extras.killed;
  }
  if (extras?.signal !== undefined) {
    (error as NodeJS.ErrnoException & { signal?: NodeJS.Signals | null }).signal = extras.signal;
  }
  if (extras?.code !== undefined && extras.code !== null) {
    (error as NodeJS.ErrnoException).code = String(extras.code);
  }
  return error;
}

function rejectChildProcessFailure(
  reject: (error: Error) => void,
  error: Error,
  extras?: ChildProcessFailureExtras,
): void {
  const sanitized = sanitizeChildProcessFailureCause(error) ?? error;
  reject(applyChildProcessFailureExtras(sanitized, extras));
}

function requireSpawnStdio(child: ReturnType<typeof spawn>): {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
} {
  const { stdin, stdout, stderr } = child;
  if (stdin === null || stdout === null || stderr === null) {
    throw new Error("child process stdio unavailable");
  }
  return { stdin, stdout, stderr };
}

function attachSpawnOutputHandlers(
  child: ReturnType<typeof spawn>,
  maxBuffer: number,
  reject: (error: Error) => void,
): { stdout: string; stderr: string } {
  const output = { stdout: "", stderr: "" };
  let stdoutBytes = 0;
  const { stdout, stderr } = requireSpawnStdio(child);

  stdout.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    stdoutBytes += Buffer.byteLength(text, "utf8");
    if (stdoutBytes > maxBuffer) {
      child.kill();
      rejectChildProcessFailure(
        reject,
        Object.assign(new Error("child process stdout maxBuffer exceeded"), {
          code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        }),
      );
      return;
    }
    output.stdout += text;
  });

  stderr.on("data", (chunk: Buffer | string) => {
    output.stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });

  return output;
}

function writeSpawnStdin(
  child: ReturnType<typeof spawn>,
  input: string,
  clearTimer: () => void,
  reject: (error: Error) => void,
): void {
  const { stdin } = requireSpawnStdio(child);
  stdin.write(input, "utf8", (writeError) => {
    if (writeError) {
      clearTimer();
      child.kill();
      rejectChildProcessFailure(reject, writeError);
      return;
    }
    stdin.end();
  });
}

interface SpawnCloseHandlerContext {
  readonly child: ReturnType<typeof spawn>;
  readonly output: { stdout: string; stderr: string };
  readonly timedOutRef: { value: boolean };
  readonly clearTimer: () => void;
  readonly resolve: (value: { stdout: string; stderr: string }) => void;
  readonly reject: (error: Error) => void;
}

function attachSpawnCloseHandler(context: SpawnCloseHandlerContext): void {
  const { child, output, timedOutRef, clearTimer, resolve, reject } = context;
  child.on("error", (error) => {
    clearTimer();
    rejectChildProcessFailure(reject, error);
  });
  child.on("close", (code, signal) => {
    clearTimer();
    if (timedOutRef.value) {
      rejectChildProcessFailure(reject, new Error("child process timed out"), {
        killed: true,
        signal,
      });
      return;
    }
    if (code === 0) {
      resolve(output);
      return;
    }
    rejectChildProcessFailure(
      reject,
      Object.assign(new Error("child process exited with failure"), {
        code,
        stderr: output.stderr,
      }),
      { code, signal },
    );
  });
}

async function execFileWithStdin(
  file: string,
  args: readonly string[],
  options: KeyStoreExecFileOptions & { input: string },
): Promise<{ stdout: string; stderr: string }> {
  const nodeOptions = buildNodeExecFileOptions(options);
  const maxBuffer = nodeOptions.maxBuffer ?? 1024;
  const timeoutMs = nodeOptions.timeout ?? DEFAULT_EXEC_FILE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      env: nodeOptions.env,
      windowsHide: nodeOptions.windowsHide,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timedOutRef = { value: false };
    const timer = setTimeout(() => {
      timedOutRef.value = true;
      child.kill();
    }, timeoutMs);
    const clearTimer = () => {
      clearTimeout(timer);
    };

    const output = attachSpawnOutputHandlers(child, maxBuffer, reject);
    attachSpawnCloseHandler({
      child,
      output,
      timedOutRef,
      clearTimer,
      resolve,
      reject,
    });
    writeSpawnStdin(child, options.input, clearTimer, reject);
  });
}

export function createDefaultExecFile(): ExecFileFn {
  const promisifiedExecFile = promisify(nodeExecFile);
  return async (file, args, options) => {
    const resolvedOptions = resolveExecFileOptions(options);
    if (resolvedOptions.input !== undefined) {
      return execFileWithStdin(file, args, {
        ...resolvedOptions,
        input: resolvedOptions.input,
      });
    }

    const result = await promisifiedExecFile(file, args, buildNodeExecFileOptions(resolvedOptions));
    return {
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  };
}
