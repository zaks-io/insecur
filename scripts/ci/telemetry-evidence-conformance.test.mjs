import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_PLAINTEXT_EXTERNAL_SURFACES } from "../../packages/release-gate/src/no-plaintext-surface-registry.ts";
import { collectTelemetryEvidenceFailures } from "./telemetry-evidence-conformance-lib.mjs";

const REGISTERED_OBSERVABILITY = {
  enabled: true,
  logs: { enabled: true, destinations: ["axiom-logs"], head_sampling_rate: 1 },
  traces: {
    enabled: true,
    destinations: ["axiom-traces", "sentry-traces-insecur"],
    head_sampling_rate: 1,
  },
};

function deploy(name, config) {
  return { name, config };
}

test("committed destination shape with per-provider registry bindings passes", () => {
  const deploys = [
    deploy("insecur-api", {
      observability: REGISTERED_OBSERVABILITY,
      env: { preview: { observability: REGISTERED_OBSERVABILITY } },
    }),
  ];
  assert.deepEqual(collectTelemetryEvidenceFailures(deploys, NO_PLAINTEXT_EXTERNAL_SURFACES), []);
});

test("a new log destination without a registry binding fails", () => {
  const deploys = [
    deploy("insecur-api", {
      observability: {
        ...REGISTERED_OBSERVABILITY,
        logs: { enabled: true, destinations: ["axiom-logs", "new-log-sink"] },
      },
    }),
  ];
  const failures = collectTelemetryEvidenceFailures(deploys, NO_PLAINTEXT_EXTERNAL_SURFACES);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /new-log-sink/u);
  assert.match(failures[0], /no evidence-surface binding/u);
});

test("a new trace destination in an env override without a registry binding fails", () => {
  const deploys = [
    deploy("insecur-web", {
      observability: REGISTERED_OBSERVABILITY,
      env: {
        preview: {
          observability: {
            ...REGISTERED_OBSERVABILITY,
            traces: {
              enabled: true,
              destinations: ["axiom-traces", "sentry-traces-insecur", "honeycomb-traces"],
            },
          },
        },
      },
    }),
  ];
  const failures = collectTelemetryEvidenceFailures(deploys, NO_PLAINTEXT_EXTERNAL_SURFACES);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /env\.preview/u);
  assert.match(failures[0], /honeycomb-traces/u);
});

test("a registry binding without any configured destination fails as stale", () => {
  const deploys = [
    deploy("insecur-api", {
      observability: {
        ...REGISTERED_OBSERVABILITY,
        traces: { enabled: true, destinations: ["axiom-traces"] },
      },
    }),
  ];
  const failures = collectTelemetryEvidenceFailures(deploys, NO_PLAINTEXT_EXTERNAL_SURFACES);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no_plaintext\.worker_traces\.sentry/u);
  assert.match(failures[0], /stale binding/u);
});

test("Workers Logpush and tail consumers fail as unregistered egress", () => {
  const deploys = [
    deploy("insecur-api", {
      logpush: true,
      observability: REGISTERED_OBSERVABILITY,
      env: {
        preview: {
          observability: REGISTERED_OBSERVABILITY,
          tail_consumers: [{ service: "log-drain" }],
        },
      },
    }),
  ];
  const failures = collectTelemetryEvidenceFailures(deploys, NO_PLAINTEXT_EXTERNAL_SURFACES);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /Logpush/u);
  assert.match(failures[1], /tail_consumers/u);
});

test("registry telemetry bindings pin distinct provider targets", () => {
  const telemetryEntries = NO_PLAINTEXT_EXTERNAL_SURFACES.filter((entry) => "telemetry" in entry);
  assert.equal(telemetryEntries.length, 3);
  for (const entry of telemetryEntries) {
    assert.equal(typeof entry.telemetry.targetRef, "string");
    assert.notEqual(entry.telemetry.targetRef.length, 0);
  }
  const traceTargets = telemetryEntries
    .filter((entry) => entry.telemetry.channel === "traces")
    .map((entry) => entry.telemetry.targetRef);
  assert.equal(new Set(traceTargets).size, traceTargets.length);
});
