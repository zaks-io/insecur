import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSupportedProcessTreePlatform,
  spawnCommand,
  terminateChildProcessTree,
} from "../src/commands/run-child.js";

function childWithPid(pid: number) {
  const child = new EventEmitter() as EventEmitter & ChildProcess;
  Object.assign(child, {
    pid,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  });
  return child;
}

describe("runtime-injected child process cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("fails closed on Windows until process-tree containment is available", () => {
    expect(() => assertSupportedProcessTreePlatform("win32")).toThrow(
      "Runtime injection on Windows is unavailable",
    );
  });
  it.runIf(process.platform !== "win32")("signals the owned process group", () => {
    const child = childWithPid(42_424);
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);

    terminateChildProcessTree(child, "SIGTERM");

    expect(kill).toHaveBeenCalledWith(-42_424, "SIGTERM");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it.runIf(process.platform !== "win32")(
    "can escalate the owned group after its direct child exits",
    () => {
      const child = childWithPid(42_425);
      Object.assign(child, { signalCode: "SIGTERM" });
      const kill = vi.spyOn(process, "kill").mockImplementation(() => true);

      terminateChildProcessTree(child, "SIGKILL");

      expect(kill).toHaveBeenCalledWith(-42_425, "SIGKILL");
    },
  );

  it.runIf(process.platform !== "win32")(
    "force-cleans the owned process group after a normal direct-child exit",
    async () => {
      const kill = vi.spyOn(process, "kill").mockImplementation(() => true);

      await spawnCommand([process.execPath, "-e", "process.exit(0)"], {
        PATH: process.env.PATH,
      });

      expect(kill).toHaveBeenCalledWith(expect.any(Number), "SIGKILL");
      expect(kill.mock.calls[0]?.[0]).toBeLessThan(0);
    },
  );
});
