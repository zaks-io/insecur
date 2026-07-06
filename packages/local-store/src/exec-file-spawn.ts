import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

import { sanitizeChildProcessFailureCause } from "./exec-file-error.js";
import type { ExecFileOptions as KeyStoreExecFileOptions } from "./types.js";
import { buildNodeExecFileOptions } from "./exec-file-options.js";

interface ChildProcessFailureExtras {
  readonly killed?: boolean;
  readonly signal?: NodeJS.Signals | null;
  readonly code?: number | null;
}

interface SpawnOutputState {
  stdout: string;
  stderr: string;
  stdoutDecoder: StringDecoder;
  stderrDecoder: StringDecoder;
}

interface AppendSpawnStreamChunkInput {
  readonly chunk: Buffer | string;
  readonly decoder: StringDecoder;
  readonly accumulated: string;
  readonly bytesRead: number;
  readonly maxBuffer: number;
}

function applyChildProcessFailureExtras(error: Error, extras?: ChildProcessFailureExtras): Error {
  if (extras?.killed !== undefined) {
    (error as NodeJS.ErrnoException & { killed?: boolean }).killed = extras.killed;
  }
  if (extras?.signal !== undefined) {
    (error as NodeJS.ErrnoException & { signal?: NodeJS.Signals | null }).signal = extras.signal;
  }
  if (extras?.code !== undefined && extras.code !== null) {
    Object.assign(error, { code: extras.code });
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

function toSpawnDataBuffer(chunk: Buffer | string): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
}

function finalizeSpawnOutput(state: SpawnOutputState): { stdout: string; stderr: string } {
  return {
    stdout: state.stdout + state.stdoutDecoder.end(),
    stderr: state.stderr + state.stderrDecoder.end(),
  };
}

export function appendSpawnStreamChunk(input: AppendSpawnStreamChunkInput): {
  text: string;
  bytesRead: number;
  exceeded: boolean;
} {
  const buffer = toSpawnDataBuffer(input.chunk);
  const nextBytesRead = input.bytesRead + buffer.length;
  if (nextBytesRead > input.maxBuffer) {
    return { text: input.accumulated, bytesRead: nextBytesRead, exceeded: true };
  }
  return {
    text: input.accumulated + input.decoder.write(buffer),
    bytesRead: nextBytesRead,
    exceeded: false,
  };
}

function rejectSpawnMaxBufferExceeded(
  child: ReturnType<typeof spawn>,
  reject: (error: Error) => void,
): void {
  child.kill();
  rejectChildProcessFailure(
    reject,
    Object.assign(new Error("child process stdio maxBuffer exceeded"), {
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    }),
  );
}

function attachSpawnOutputHandlers(
  child: ReturnType<typeof spawn>,
  maxBuffer: number,
  reject: (error: Error) => void,
): SpawnOutputState {
  const output: SpawnOutputState = {
    stdout: "",
    stderr: "",
    stdoutDecoder: new StringDecoder("utf8"),
    stderrDecoder: new StringDecoder("utf8"),
  };
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const { stdout, stderr } = requireSpawnStdio(child);

  stdout.on("data", (chunk: Buffer | string) => {
    const appended = appendSpawnStreamChunk({
      chunk,
      decoder: output.stdoutDecoder,
      accumulated: output.stdout,
      bytesRead: stdoutBytes,
      maxBuffer,
    });
    stdoutBytes = appended.bytesRead;
    if (appended.exceeded) {
      rejectSpawnMaxBufferExceeded(child, reject);
      return;
    }
    output.stdout = appended.text;
  });

  stderr.on("data", (chunk: Buffer | string) => {
    const appended = appendSpawnStreamChunk({
      chunk,
      decoder: output.stderrDecoder,
      accumulated: output.stderr,
      bytesRead: stderrBytes,
      maxBuffer,
    });
    stderrBytes = appended.bytesRead;
    if (appended.exceeded) {
      rejectSpawnMaxBufferExceeded(child, reject);
      return;
    }
    output.stderr = appended.text;
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
  readonly output: SpawnOutputState;
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
      resolve(finalizeSpawnOutput(output));
      return;
    }
    const finalized = finalizeSpawnOutput(output);
    rejectChildProcessFailure(
      reject,
      Object.assign(new Error("child process exited with failure"), {
        code,
        stderr: finalized.stderr,
      }),
      { code, signal },
    );
  });
}

export async function execFileWithStdin(
  file: string,
  args: readonly string[],
  options: KeyStoreExecFileOptions & { input: string },
): Promise<{ stdout: string; stderr: string }> {
  const nodeOptions = buildNodeExecFileOptions(options);
  const maxBuffer = nodeOptions.maxBuffer ?? 1024;
  const timeoutMs = nodeOptions.timeout ?? 30_000;

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
