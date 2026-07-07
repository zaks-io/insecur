import type { ChildProcess } from "node:child_process";
import { constants as osConstants } from "node:os";
import { watch } from "node:fs";
import path from "node:path";
import type { InjectionGrantId } from "@insecur/domain";
import { spawnCommandManaged } from "./run-child.js";

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
  child.kill("SIGTERM");
}

function createFilesystemRestartSignal(watchRoot: string): {
  readonly waitForRestart: () => Promise<void>;
  readonly dispose: () => void;
} {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingResolve: (() => void) | undefined;
  let disposed = false;

  const watcher = watch(watchRoot, { recursive: true }, () => {
    if (disposed) {
      return;
    }
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      pendingResolve?.();
      pendingResolve = undefined;
    }, WATCH_DEBOUNCE_MS);
  });

  return {
    waitForRestart: () =>
      new Promise<void>((resolve) => {
        pendingResolve = resolve;
      }),
    dispose: () => {
      disposed = true;
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      watcher.close();
      pendingResolve = undefined;
    },
  };
}

async function raceChildExitOrRestart(input: {
  readonly exitCode: Promise<number>;
  readonly waitForRestart: () => Promise<void>;
}): Promise<"restart" | { readonly kind: "exit"; readonly exitCode: number }> {
  return new Promise((resolve) => {
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

    void input.exitCode.then(settleExit);
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
