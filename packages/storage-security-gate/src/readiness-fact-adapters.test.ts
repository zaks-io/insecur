import { describe, expect, it } from "vitest";

import {
  mapCanaryEvidenceToNoPlaintextProbeOutcome,
  mapReadinessReportToProbeOutcome,
} from "./readiness-fact-adapters.js";

describe("mapReadinessReportToProbeOutcome", () => {
  it("maps ready reports to passed probes", () => {
    const outcome = mapReadinessReportToProbeOutcome({
      controlId: "storage.tenant_store",
      status: "ready",
      passedSummary: "Tenant store readiness passed.",
      blockedSummary: "Tenant store readiness blocked.",
      evidence: [{ kind: "configuration_version", id: "rls_v1" }],
    });

    expect(outcome).toEqual({
      status: "passed",
      summary: "Tenant store readiness passed.",
      evidence: [{ kind: "configuration_version", id: "rls_v1" }],
    });
  });

  it("maps not_ready reports to blocked probes", () => {
    const outcome = mapReadinessReportToProbeOutcome({
      controlId: "storage.tenant_store",
      status: "not_ready",
      passedSummary: "passed",
      blockedSummary: "Runtime role bypasses RLS.",
      blockingReason: "runtime_role_bypasses_rls",
    });

    expect(outcome.status).toBe("blocked");
    expect(outcome).toMatchObject({
      summary: "Runtime role bypasses RLS.",
      blocking_reason: "runtime_role_bypasses_rls",
    });
  });

  it("maps unknown reports to unknown probes", () => {
    const outcome = mapReadinessReportToProbeOutcome({
      controlId: "storage.tenant_store",
      status: "unknown",
      passedSummary: "passed",
      blockedSummary: "blocked",
      unknownSummary: "Tenant store probe unreachable.",
    });

    expect(outcome.status).toBe("unknown");
    expect(outcome.summary).toBe("Tenant store probe unreachable.");
  });
});

describe("mapCanaryEvidenceToNoPlaintextProbeOutcome", () => {
  it("passes when canary evidence id is present and passed", () => {
    const outcome = mapCanaryEvidenceToNoPlaintextProbeOutcome({
      testRunId: "canary-2026-07-08",
      passed: true,
    });

    expect(outcome.status).toBe("passed");
    expect(outcome.evidence).toEqual([{ kind: "test_run_id", id: "canary-2026-07-08" }]);
  });

  it("returns unknown when canary evidence is missing", () => {
    const outcome = mapCanaryEvidenceToNoPlaintextProbeOutcome({
      testRunId: null,
      passed: false,
    });

    expect(outcome.status).toBe("unknown");
  });
});
