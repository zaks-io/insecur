import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isStaleMachineRootKeyLock,
  resolveMachineRootKeyLockPath,
  withMachineRootKeyCreationLock,
} from "./machine-root-key-lock.js";

describe("withMachineRootKeyCreationLock", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir !== "") {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("serializes concurrent callers through the same lock path", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    let active = 0;
    let maxActive = 0;

    const run = async () =>
      withMachineRootKeyCreationLock(lockPath, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });
        active -= 1;
        return "ok";
      });

    await Promise.all([run(), run()]);
    expect(maxActive).toBe(1);
  });

  it("publishes complete owner metadata without blocking on unpublished candidates", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    const abandonedPendingPath = `${lockPath}.abandoned.pending`;
    await writeFile(abandonedPendingPath, "", { encoding: "utf8", mode: 0o600 });

    await expect(
      withMachineRootKeyCreationLock(lockPath, async () => {
        const metadata = JSON.parse(await readFile(lockPath, "utf8")) as {
          pid?: number;
          token?: string;
        };
        expect(metadata.pid).toBe(process.pid);
        expect(metadata.token).toBeTypeOf("string");
        return "created";
      }),
    ).resolves.toBe("created");

    await expect(readdir(tempDir)).resolves.toEqual([path.basename(abandonedPendingPath)]);
  });

  it.each([
    ["tokenized", { pid: 9_999_999, acquiredAt: 0, token: "dead-holder-token" }],
    ["legacy", { pid: 9_999_999, acquiredAt: 0 }],
  ])("recovers from a %s lock whose PID is dead", async (_kind, metadata) => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(lockPath, JSON.stringify(metadata), {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(await isStaleMachineRootKeyLock(lockPath)).toBe(true);

    await expect(
      withMachineRootKeyCreationLock(
        lockPath,
        () => Promise.resolve("created"),
        () => Promise.resolve(null),
      ),
    ).resolves.toBe("created");
  });

  it("serializes contenders that race to recover the same dead lock", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 9_999_999, acquiredAt: 0, token: "dead-holder-token" }),
      { encoding: "utf8", mode: 0o600 },
    );
    let recoveryWaiters = 0;
    let releaseRecoveryWaiters: (() => void) | undefined;
    const recoveryBarrier = new Promise<void>((resolve) => {
      releaseRecoveryWaiters = resolve;
    });
    let active = 0;
    let maxActive = 0;

    const run = async () => {
      let reconcileCalls = 0;
      return withMachineRootKeyCreationLock(
        lockPath,
        async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => {
            setTimeout(resolve, 25);
          });
          active -= 1;
          return "created";
        },
        async () => {
          reconcileCalls += 1;
          if (reconcileCalls === 2) {
            recoveryWaiters += 1;
            if (recoveryWaiters === 2) {
              releaseRecoveryWaiters?.();
            }
            await recoveryBarrier;
          }
          return null;
        },
      );
    };

    await expect(Promise.all([run(), run()])).resolves.toEqual(["created", "created"]);
    expect(maxActive).toBe(1);
  });

  it.each([
    ["tokenized", { pid: process.pid, acquiredAt: 0, token: "live-holder-token" }],
    ["legacy", { pid: process.pid, acquiredAt: 0 }],
  ])("does not treat an old %s lock with a live PID as stale", async (_kind, metadata) => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(lockPath, JSON.stringify(metadata), {
      encoding: "utf8",
      mode: 0o600,
    });

    await expect(isStaleMachineRootKeyLock(lockPath)).resolves.toBe(false);
  });

  it("does not run a second creator behind an old live-PID lock", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, acquiredAt: 0, token: "live-holder-token" }),
      { encoding: "utf8", mode: 0o600 },
    );
    let createCalls = 0;

    const contender = withMachineRootKeyCreationLock(lockPath, () => {
      createCalls += 1;
      return Promise.resolve("created");
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(createCalls).toBe(0);

    await rm(lockPath);
    await expect(contender).resolves.toBe("created");
    expect(createCalls).toBe(1);
  });

  it("does not age out lock files whose holder cannot be identified", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(lockPath, "", { encoding: "utf8", mode: 0o600 });
    await utimes(lockPath, new Date(0), new Date(0));

    await expect(isStaleMachineRootKeyLock(lockPath)).resolves.toBe(false);
  });

  it("returns reconciled material without taking over a stale lock", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(lockPath, JSON.stringify({ pid: 9_999_999, acquiredAt: 0 }), {
      encoding: "utf8",
      mode: 0o600,
    });

    await expect(
      withMachineRootKeyCreationLock(
        lockPath,
        () => Promise.resolve("created"),
        () => Promise.resolve("existing"),
      ),
    ).resolves.toBe("existing");
  });

  it("does not delete a lock re-acquired while reconciling a stale lock", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    const staleToken = "stale-lock-token";
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 9_999_999, acquiredAt: 0, token: staleToken }),
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );

    let reconcileCalls = 0;
    await expect(
      withMachineRootKeyCreationLock(
        lockPath,
        () => Promise.resolve("created"),
        async () => {
          reconcileCalls += 1;
          if (reconcileCalls === 2) {
            await writeFile(
              lockPath,
              JSON.stringify({
                pid: process.pid,
                acquiredAt: Date.now(),
                token: "fresh-holder-token",
              }),
              { encoding: "utf8", mode: 0o600 },
            );
            return null;
          }
          if (reconcileCalls >= 3) {
            return "found";
          }
          return null;
        },
      ),
    ).resolves.toBe("found");

    const remaining = JSON.parse(await readFile(lockPath, "utf8")) as { token?: string };
    expect(remaining.token).toBe("fresh-holder-token");
  });

  it("releases only the lock token held by this caller", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);

    await withMachineRootKeyCreationLock(lockPath, async () => {
      const metadata = JSON.parse(await readFile(lockPath, "utf8")) as { token?: string };
      await writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          acquiredAt: Date.now(),
          token: "other-holder-token",
        }),
        { encoding: "utf8", mode: 0o600 },
      );
      expect(metadata.token).toBeDefined();
      return "done";
    });

    const remaining = JSON.parse(await readFile(lockPath, "utf8")) as { token?: string };
    expect(remaining.token).toBe("other-holder-token");
  });
});
