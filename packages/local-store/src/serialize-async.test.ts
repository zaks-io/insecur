import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { serializeAsync, singleFlightBySlot } from "./serialize-async.js";

describe("serializeAsync", () => {
  it("serializes concurrent calls on one wrapper", async () => {
    let active = 0;
    let maxActive = 0;
    const run = serializeAsync(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      active -= 1;
      return "ok";
    });

    await Promise.all([run(), run()]);
    expect(maxActive).toBe(1);
  });
});

describe("singleFlightBySlot", () => {
  it("shares one in-flight operation across wrappers for the same slot", async () => {
    let calls = 0;
    const slot = `test-slot-${String(Date.now())}`;
    const first = singleFlightBySlot(slot, async () => {
      calls += 1;
      await sleep(10);
      return "shared";
    });
    const second = singleFlightBySlot(slot, () => {
      calls += 1;
      return Promise.resolve("other");
    });

    const [left, right] = await Promise.all([first(), second()]);
    expect(left).toBe("shared");
    expect(right).toBe("shared");
    expect(calls).toBe(1);
  });

  it("memoizes a resolved value for later callers", async () => {
    let calls = 0;
    const slot = `memo-slot-${String(Date.now())}`;
    const run = singleFlightBySlot(slot, () => {
      calls += 1;
      return Promise.resolve("stable");
    });

    await expect(run()).resolves.toBe("stable");
    await expect(run()).resolves.toBe("stable");
    expect(calls).toBe(1);
  });

  it("clears the slot after a failed operation", async () => {
    let calls = 0;
    const slot = `fail-slot-${String(Date.now())}`;
    const run = singleFlightBySlot(slot, () => {
      calls += 1;
      return Promise.reject(new Error("boom"));
    });

    await expect(run()).rejects.toThrow("boom");
    await expect(run()).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });
});
