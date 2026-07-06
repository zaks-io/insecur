import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

  it("recovers from a stale first-run lock after re-lookup misses", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-lock-"));
    const lockPath = resolveMachineRootKeyLockPath(tempDir);
    await writeFile(lockPath, JSON.stringify({ pid: 9_999_999, acquiredAt: 0 }), {
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
});
