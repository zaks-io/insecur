import assert from "node:assert/strict";
import test from "node:test";

import { retryPostgresDeadlock } from "./retry-postgres-deadlock.mjs";

test("retries PostgreSQL deadlocks with bounded backoff", async () => {
  let calls = 0;
  const delays = [];

  const result = await retryPostgresDeadlock(
    () => {
      calls += 1;
      if (calls < 3) return Promise.reject(Object.assign(new Error("deadlock"), { code: "40P01" }));
      return Promise.resolve("ok");
    },
    { attempts: 4, delayMs: 10, sleep: (delay) => delays.push(delay) },
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("does not retry other PostgreSQL failures", async () => {
  let calls = 0;
  const error = Object.assign(new Error("permission denied"), { code: "42501" });

  await assert.rejects(
    retryPostgresDeadlock(() => {
      calls += 1;
      return Promise.reject(error);
    }),
    error,
  );
  assert.equal(calls, 1);
});

test("surfaces a deadlock after the attempt limit", async () => {
  let calls = 0;
  const error = Object.assign(new Error("deadlock"), { code: "40P01" });

  await assert.rejects(
    retryPostgresDeadlock(
      () => {
        calls += 1;
        return Promise.reject(error);
      },
      { attempts: 3, sleep: () => undefined },
    ),
    error,
  );
  assert.equal(calls, 3);
});
