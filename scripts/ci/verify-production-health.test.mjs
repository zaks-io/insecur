import assert from "node:assert/strict";
import test from "node:test";

import { validateHealthBody, verifyProductionHealth } from "./verify-production-health.mjs";

const SHA = "a".repeat(40);

test("validates exact production service, SHA, and run identity", () => {
  assert.deepEqual(
    validateHealthBody(
      { deploySha: SHA, ok: true, runId: "42", service: "insecur-api" },
      "insecur-api",
      SHA,
    ),
    { deploySha: SHA, runId: "42", service: "insecur-api" },
  );
  assert.throws(
    () =>
      validateHealthBody(
        { deploySha: "b".repeat(40), ok: true, runId: "42", service: "insecur-api" },
        "insecur-api",
        SHA,
      ),
    /expected/u,
  );
});

test("retries until all production identities converge", async () => {
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    const service = url.includes("api.")
      ? "insecur-api"
      : url.includes("app.")
        ? "insecur-web"
        : "insecur-site";
    return {
      json: async () => ({
        deploySha: calls <= 3 ? "b".repeat(40) : SHA,
        ok: true,
        runId: "42",
        service,
      }),
      ok: true,
    };
  };
  await verifyProductionHealth(SHA, { attempts: 2, fetcher, retryDelayMs: 0 });
  assert.equal(calls, 6);
});
