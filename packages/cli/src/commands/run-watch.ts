import type { ChildProcess } from "node:child_process";
import { constants as osConstants } from "node:os";
import { watch } from "node:fs";
import path from "node:path";
import type { InjectionGrantId } from "@insecur/domain";
import { isIgnoredProjectPath } from "../scan/ignored-paths.js";
import { spawnCommandManaged, terminateChildProcessTree } from "./run-child.js";

interface RunWatchIteration {
  readonly grantId: InjectionGrantId;
  readonly childEnv: NodeJS.ProcessEnv;
  /** Drop in-memory decoded Sensitive Values before the next grant fetch. */
  readonly releaseSensitiveValues: () => void;
  readonly onChildCompleted: (childExitCode: number) => Promise<void>;
}

export interface RunWatchLoopInput {
  readonly command: readonly string[];
  readonly watchRoot: string;
  readonly executeIteration: () => Promise<RunWatchIteration>;
  /** Test seam: bypass filesystem watching and await an explicit restart signal. */
  readonly waitForRestartSignal?: () => Promise<void>;
}

const WATCH_DEBOUNCE_MS = 100;
const CHILD_KILL_ESCALATION_MS = 5_000;

function exitCodeForChildClose(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  if (signal === null) {
    return 0;
  }
  const signalNumber = osConstants.signals[signal];
  return 128 + signalNumber;
}

function terminateChild(child: ChildProcess): void {
  if (child.exitCode != null || child.signalCode != null) {
    return;
  }
  terminateChildProcessTree(child, "SIGTERM");
  const escalationTimer = setTimeout(() => {
    terminateChildProcessTree(child, "SIGKILL");
  }, CHILD_KILL_ESCALATION_MS);
  escalationTimer.unref();
}

function createFilesystemRestartSignal(watchRoot: string): {
  readonly waitForRestart: () => Promise<void>;
  readonly dispose: () => void;
} {
  const state = createRestartSignalState();
  const watcher = attachFilesystemRestartWatcher(watchRoot, state);

  return {
    waitForRestart: () => waitForFilesystemRestart(state),
    dispose: () => {
      disposeFilesystemRestartSignal(state, watcher);
    },
  };
}

interface RestartSignalState {
  debounceTimer: ReturnType<typeof setTimeout> | undefined;
  pendingResolve: (() => void) | undefined;
  pendingRestart: boolean;
  disposed: boolean;
}

function createRestartSignalState(): RestartSignalState {
  return {
    debounceTimer: undefined,
    pendingResolve: undefined,
    pendingRestart: false,
    disposed: false,
  };
}

function signalFilesystemRestart(state: RestartSignalState): void {
  if (state.pendingResolve !== undefined) {
    state.pendingResolve();
    state.pendingResolve = undefined;
    return;
  }
  state.pendingRestart = true;
}

function shouldIgnoreWatchEvent(filename: string | Buffer | null): boolean {
  if (filename === null) {
    return false;
  }
  return isIgnoredProjectPath(filename.toString());
}

function attachFilesystemRestartWatcher(
  watchRoot: string,
  state: RestartSignalState,
): ReturnType<typeof watch> {
  const watcher = watch(watchRoot, { recursive: true }, (_eventType, filename) => {
    if (state.disposed) {
      return;
    }
    if (shouldIgnoreWatchEvent(filename)) {
      return;
    }
    if (state.debounceTimer !== undefined) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = undefined;
      signalFilesystemRestart(state);
    }, WATCH_DEBOUNCE_MS);
  });

  watcher.on("error", () => {
    if (state.disposed) {
      return;
    }
    signalFilesystemRestart(state);
  });

  return watcher;
}

function waitForFilesystemRestart(state: RestartSignalState): Promise<void> {
  return new Promise<void>((resolve) => {
    if (state.pendingRestart) {
      state.pendingRestart = false;
      resolve();
      return;
    }
    state.pendingResolve = resolve;
  });
}

function disposeFilesystemRestartSignal(
  state: RestartSignalState,
  watcher: ReturnType<typeof watch>,
): void {
  state.disposed = true;
  if (state.debounceTimer !== undefined) {
    clearTimeout(state.debounceTimer);
  }
  watcher.close();
  state.pendingResolve = undefined;
}

async function raceChildExitOrRestart(input: {
  readonly exitCode: Promise<number>;
  readonly waitForRestart: () => Promise<void>;
}): Promise<"restart" | { readonly kind: "exit"; readonly exitCode: number }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleRestart = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve("restart");
    };
    const settleExit = (exitCode: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ kind: "exit", exitCode });
    };
    const settleFailure = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof Error ? error : new Error("Child process failed", { cause: error }));
    };

    void input.exitCode.then(settleExit, settleFailure);
    void input.waitForRestart().then(settleRestart);
  });
}

async function runWatchCycle(input: {
  readonly command: readonly string[];
  readonly executeIteration: () => Promise<RunWatchIteration>;
  readonly waitForRestart: () => Promise<void>;
}): Promise<number | "restart"> {
  const iteration = await input.executeIteration();
  const managed = spawnCommandManaged(input.command, iteration.childEnv);
  try {
    const outcome = await raceChildExitOrRestart({
      exitCode: managed.exitCode,
      waitForRestart: input.waitForRestart,
    });

    if (outcome === "restart") {
      terminateChild(managed.child);
      const interruptedExitCode = await managed.exitCode.catch(() =>
        exitCodeForChildClose(null, "SIGTERM"),
      );
      iteration.releaseSensitiveValues();
      await iteration.onChildCompleted(interruptedExitCode);
      return "restart";
    }

    iteration.releaseSensitiveValues();
    await iteration.onChildCompleted(outcome.exitCode);
    return outcome.exitCode;
  } catch (error) {
    iteration.releaseSensitiveValues();
    throw error;
  }
}

export async function runWatchLoop(input: RunWatchLoopInput): Promise<number> {
  const command = input.command;
  const executable = command[0];
  if (executable === undefined || executable === "") {
    throw new Error("runWatchLoop requires a validated command");
  }

  const watchRoot = path.resolve(input.watchRoot);
  const restartSignal =
    input.waitForRestartSignal === undefined
      ? createFilesystemRestartSignal(watchRoot)
      : {
          waitForRestart: input.waitForRestartSignal,
          dispose: () => undefined,
        };

  try {
    for (;;) {
      const result = await runWatchCycle({
        command,
        executeIteration: input.executeIteration,
        waitForRestart: restartSignal.waitForRestart,
      });
      if (result !== "restart") {
        return result;
      }
    }
  } finally {
    restartSignal.dispose();
  }
}
