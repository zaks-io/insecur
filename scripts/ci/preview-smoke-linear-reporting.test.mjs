import assert from "node:assert/strict";
import test from "node:test";

import {
  failureFromEvidence,
  labelsFromEnv,
  markerFor,
  safeText,
} from "./preview-smoke-linear-reporting.mjs";

test("preview smoke Linear labels default to repo routing and Bug", () => {
  assert.deepEqual(labelsFromEnv({}), ["zaks-io/insecur", "Bug"]);
});

test("preview smoke Linear labels accept explicit workflow labels", () => {
  assert.deepEqual(
    labelsFromEnv({
      LINEAR_PREVIEW_SMOKE_LABELS: "zaks-io/insecur, risk-security-sensitive, Bug",
    }),
    ["zaks-io/insecur", "risk-security-sensitive", "Bug"],
  );
});

test("preview smoke Linear failure metadata is sanitized", () => {
  const failure = failureFromEvidence({
    failure: {
      checkId: "runtime_injection.grant_consume",
      message: "failed\nwith {secret}",
    },
  });

  assert.deepEqual(failure, {
    checkId: "runtime_injection.grant_consume",
    message: "failed with secret",
  });
  assert.match(markerFor(failure.checkId), /^insecur-preview-smoke:[a-f0-9]{64}$/u);
  assert.equal(safeText("", "fallback"), "fallback");
});
