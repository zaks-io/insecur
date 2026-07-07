import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INJECTION_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";

function pendingForever(): Promise<void> {
  return new Promise(() => undefined);
}

const spawnCommandManagedMock = vi.hoisted(() => vi.fn());

vi.mock("../src/commands/run-child.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/run-child.js")>();
  return {
    ...actual,
    spawnCommandManaged: spawnCommandManagedMock,
  };
});

import { assertRunWatchDevelopmentEnvironment } from "../src/commands/run-watch-guard.js";
import { runWatchLoop } from "../src/commands/run-watch.js";
import type { InsecurProjectConfig } from "../src/config/project-config.js";
import { EXIT_FORBIDDEN, EXIT_VALIDATION } from "../src/output/exit-codes.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const DEV_ENV_ID = "env_01TEST0000000000000000001";
const PREVIEW_ENV_ID = "env_01TEST0000000000000000002";

const projectConfig: InsecurProjectConfig = {
  host: "https://insecur.test",
  orgId: ORG_ID as never,
  projectId: PROJECT_ID as never,
  defaultEnvId: DEV_ENV_ID as never,
  profileId: "prof_01TEST00000000000000000001" as never,
};

function exitCodeForChild(
  child: EventEmitter & ChildProcess & { kill: ReturnType<typeof vi.fn> },
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      if (signal === null) {
        resolve(0);
        return;
      }
      resolve(143);
    });
  });
}

function createManagedChild(exitCode: number, waitForKill = false) {
  const child = new EventEmitter() as EventEmitter &
    ChildProcess & {
      kill: ReturnType<typeof vi.fn>;
    };
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    child.emit("close", null, signal ?? "SIGTERM");
  });
  return { child, autoExitCode: waitForKill ? undefined : exitCode };
}

function spawnManagedChild(exitCode: number, waitForKill = false) {
  const { child, autoExitCode } = createManagedChild(exitCode, waitForKill);
  const exitCodePromise = exitCodeForChild(child);
  if (autoExitCode !== undefined) {
    queueMicrotask(() => {
      child.emit("close", autoExitCode, null);
    });
  }
  return { child, exitCode: exitCodePromise };
}

function spawnManagedChildSpawnError(error: Error) {
  const child = new EventEmitter() as EventEmitter &
    ChildProcess & {
      kill: ReturnType<typeof vi.fn>;
    };
  child.kill = vi.fn();
  const exitCode = Promise.reject(error);
  void exitCode.catch(() => undefined);
  return { child, exitCode };
}

describe("assertRunWatchDevelopmentEnvironment", () => {
  it("rejects watch when the target environment is not the project development environment", () => {
    expect(() =>
      assertRunWatchDevelopmentEnvironment({
        envId: PREVIEW_ENV_ID as never,
        projectConfig,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        exitCode: EXIT_VALIDATION,
      }),
    );
  });

  it("rejects watch without project config", () => {
    expect(() =>
      assertRunWatchDevelopmentEnvironment({
        envId: DEV_ENV_ID as never,
        projectConfig: null,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
      }),
    );
  });
});

describe("runWatchLoop", () => {
  afterEach(() => {
    spawnCommandManagedMock.mockReset();
  });

  it("returns the child exit code when no restart signal arrives", async () => {
    spawnCommandManagedMock.mockImplementation(() => spawnManagedChild(0, false));

    const exitCode = await runWatchLoop({
      command: ["node", "-e", "0"],
      watchRoot: process.cwd(),
      waitForRestartSignal: async () => pendingForever(),
      executeIteration: async () => ({
        grantId: "igr_only" as never,
        childEnv: { API_KEY: "secret" },
        releaseSensitiveValues: () => undefined,
        onChildCompleted: async () => undefined,
      }),
    });

    expect(exitCode).toBe(0);
    expect(spawnCommandManagedMock).toHaveBeenCalledTimes(1);
  });

  it("fetches a fresh grant before every restart and does not retain plaintext between iterations", async () => {
    const grantIds: string[] = [];
    const retainedChecks: boolean[] = [];
    let releasePrevious: (() => void) | undefined;
    let previousValue: string | undefined;
    let restartWaits = 0;
    let spawnCount = 0;

    spawnCommandManagedMock.mockImplementation(() => {
      spawnCount += 1;
      return spawnManagedChild(0, spawnCount === 1);
    });

    const exitCode = await runWatchLoop({
      command: ["node", "-e", "0"],
      watchRoot: process.cwd(),
      waitForRestartSignal: async () => {
        restartWaits += 1;
        if (restartWaits === 1) {
          return;
        }
        await pendingForever();
      },
      executeIteration: async () => {
        const decodedValue = `secret-${String(grantIds.length + 1)}`;
        if (previousValue !== undefined) {
          retainedChecks.push(previousValue === decodedValue);
        }
        releasePrevious?.();
        previousValue = decodedValue;
        const currentGrantId = `igr_iteration_${String(grantIds.length + 1)}`;
        grantIds.push(currentGrantId);
        return {
          grantId: currentGrantId as never,
          childEnv: { API_KEY: decodedValue },
          releaseSensitiveValues: () => {
            releasePrevious = () => {
              previousValue = undefined;
            };
            releasePrevious();
            releasePrevious = undefined;
          },
          onChildCompleted: async () => undefined,
        };
      },
    });

    expect(exitCode).toBe(0);
    expect(grantIds).toEqual(["igr_iteration_1", "igr_iteration_2"]);
    expect(retainedChecks).toEqual([]);
    expect(previousValue).toBeUndefined();
    expect(spawnCommandManagedMock).toHaveBeenCalledTimes(2);
  });

  it("stops fail-closed on grant issuance failure without restarting with stale values", async () => {
    let issueCount = 0;
    let restartWaits = 0;
    spawnCommandManagedMock.mockImplementation(() => spawnManagedChild(0, true));

    await expect(
      runWatchLoop({
        command: ["node", "-e", "0"],
        watchRoot: process.cwd(),
        waitForRestartSignal: async () => {
          restartWaits += 1;
          if (restartWaits === 1) {
            return;
          }
          await pendingForever();
        },
        executeIteration: async () => {
          issueCount += 1;
          if (issueCount === 2) {
            throw Object.assign(new Error("grant denied"), {
              code: INJECTION_ERROR_CODES.grantDenied,
              exitCode: EXIT_FORBIDDEN,
            });
          }
          return {
            grantId: `igr_${String(issueCount)}` as never,
            childEnv: { API_KEY: "first-secret" },
            releaseSensitiveValues: () => undefined,
            onChildCompleted: async () => undefined,
          };
        },
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    expect(issueCount).toBe(2);
    expect(spawnCommandManagedMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when the child process fails to spawn", async () => {
    const spawnError = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    spawnCommandManagedMock.mockImplementation(() => spawnManagedChildSpawnError(spawnError));

    await expect(
      runWatchLoop({
        command: ["missing-executable"],
        watchRoot: process.cwd(),
        waitForRestartSignal: async () => pendingForever(),
        executeIteration: async () => ({
          grantId: "igr_spawn" as never,
          childEnv: { API_KEY: "secret" },
          releaseSensitiveValues: () => undefined,
          onChildCompleted: async () => undefined,
        }),
      }),
    ).rejects.toThrow("spawn ENOENT");

    expect(spawnCommandManagedMock).toHaveBeenCalledTimes(1);
  });

  it("consumes a latched restart when a file change arrives before waitForRestart is pending", async () => {
    vi.useFakeTimers();
    const watchRoot = await mkdtemp(join(tmpdir(), "insecur-watch-"));
    let iterations = 0;
    let spawnCount = 0;

    spawnCommandManagedMock.mockImplementation(() => {
      spawnCount += 1;
      return spawnManagedChild(0, spawnCount === 1);
    });

    try {
      const exitCodePromise = runWatchLoop({
        command: ["node", "-e", "0"],
        watchRoot,
        executeIteration: async () => {
          iterations += 1;
          if (iterations === 1) {
            await writeFile(join(watchRoot, "change.txt"), "x");
            await vi.advanceTimersByTimeAsync(150);
          }
          return {
            grantId: `igr_${String(iterations)}` as never,
            childEnv: {},
            releaseSensitiveValues: () => undefined,
            onChildCompleted: async () => undefined,
          };
        },
      });

      await vi.runAllTimersAsync();
      const exitCode = await exitCodePromise;

      expect(exitCode).toBe(0);
      expect(spawnCommandManagedMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      await rm(watchRoot, { recursive: true, force: true });
    }
  });
});
