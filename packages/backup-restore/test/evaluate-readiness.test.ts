import { describe, expect, it } from "vitest";

import {
  computeExportExpiresAt,
  computeRestoreDrillElapsedSeconds,
  evaluateExportFreshnessEvidence,
  evaluateRestoreDrillEvidence,
} from "../src/evaluate-readiness.js";
import type { BackupExportSuccessEvidence, RestoreDrillEvidence } from "../src/types.js";

const baseExportEvidence = (): BackupExportSuccessEvidence => ({
  status: "passed",
  checked_at: "2026-07-04T00:00:00.000Z",
  instance_id: "inst_test",
  export_timestamp: "2026-07-04T00:00:00.000Z",
  root_key_version: 1,
  organization_count: 1,
  artifact_ref: "backup/latest-export.ibkp",
  encryption_verified: true,
  expires_at: computeExportExpiresAt("2026-07-04T00:00:00.000Z"),
  operation_id: "op_00000000000000000000000001",
});

const baseDrillEvidence = (): RestoreDrillEvidence => ({
  status: "passed",
  checked_at: "2026-07-04T00:00:05.000Z",
  actor: "ci:backup-restore-drill",
  scope: {
    instance_id: "inst_test",
    organization_id: "org_01RCAN00000000000000000001",
    project_id: "prj_01RCAN00000000000000000002",
    environment_id: "env_01RCAN00000000000000000003",
    secret_id: "sec_01RCAN00000000000000000004",
  },
  rto: {
    started_at: "2026-07-04T00:00:00.000Z",
    completed_at: "2026-07-04T00:00:05.000Z",
    duration_seconds: 5,
    target_seconds: 8 * 60 * 60,
  },
  canary_verification: {
    status: "passed",
    checked_at: "2026-07-04T00:00:05.000Z",
    variable_key: "INSECUR_RECOVERY_CANARY",
  },
  encryption_verified: true,
  artifact_ref: "backup/latest-export.ibkp",
  source_artifact_kind: "scheduled_r2_export",
  source_export_operation_id: "op_00000000000000000000000001",
  source_export_timestamp: "2026-07-04T00:00:00.000Z",
  restore_target_ref: "neon-project://fresh-restore-drill",
  restore_target_kind: "fresh_neon_project",
  import_completed_at: "2026-07-04T00:00:04.000Z",
  runtime_canary_verified_at: "2026-07-04T00:00:05.000Z",
});

function evaluateDrill(evidence: RestoreDrillEvidence | null) {
  return evaluateRestoreDrillEvidence(
    evidence,
    new Date("2026-07-04T01:00:00.000Z"),
    baseExportEvidence(),
  );
}

describe("evaluateExportFreshnessEvidence", () => {
  it("passes when export evidence is fresh and encryption verified", () => {
    const now = new Date("2026-07-04T01:00:00.000Z");
    const result = evaluateExportFreshnessEvidence(baseExportEvidence(), now);
    expect(result.status).toBe("passed");
  });

  it("blocks when evidence is missing", () => {
    const result = evaluateExportFreshnessEvidence(null);
    expect(result.status).toBe("missing_evidence");
  });

  it("blocks when encryption was not verified", () => {
    const evidence = { ...baseExportEvidence(), encryption_verified: false };
    const result = evaluateExportFreshnessEvidence(evidence);
    expect(result.status).toBe("blocked");
  });

  it("blocks when export freshness expired", () => {
    const now = new Date("2026-07-10T00:00:00.000Z");
    const result = evaluateExportFreshnessEvidence(baseExportEvidence(), now);
    expect(result.status).toBe("blocked");
  });

  it("blocks when expires_at is inflated beyond export_timestamp policy", () => {
    const evidence: BackupExportSuccessEvidence = {
      ...baseExportEvidence(),
      export_timestamp: "2026-07-04T00:00:00.000Z",
      expires_at: "2026-07-20T00:00:00.000Z",
    };
    const now = new Date("2026-07-04T01:00:00.000Z");
    const result = evaluateExportFreshnessEvidence(evidence, now);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("expires_at");
  });

  it("blocks when export_timestamp is stale even with future expires_at", () => {
    const evidence: BackupExportSuccessEvidence = {
      ...baseExportEvidence(),
      export_timestamp: "2026-06-01T00:00:00.000Z",
      expires_at: computeExportExpiresAt("2026-06-01T00:00:00.000Z"),
    };
    const now = new Date("2026-07-04T01:00:00.000Z");
    const result = evaluateExportFreshnessEvidence(evidence, now);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("freshness window expired");
  });

  it("blocks future-dated export evidence", () => {
    const evidence: BackupExportSuccessEvidence = {
      ...baseExportEvidence(),
      export_timestamp: "2099-07-04T00:00:00.000Z",
      expires_at: computeExportExpiresAt("2099-07-04T00:00:00.000Z"),
    };
    const result = evaluateExportFreshnessEvidence(evidence, new Date("2026-07-04T01:00:00.000Z"));
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("must not be later");
  });
});

describe("evaluateRestoreDrillEvidence", () => {
  it("passes for successful drill evidence", () => {
    const result = evaluateDrill(baseDrillEvidence());
    expect(result.status).toBe("passed");
  });

  it("blocks when evidence is missing", () => {
    const result = evaluateDrill(null);
    expect(result.status).toBe("missing_evidence");
  });

  it("blocks when canary verification failed", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      canary_verification: {
        ...baseDrillEvidence().canary_verification,
        status: "failed",
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
  });

  it("blocks when runtime canary verification is not later than import completion", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      runtime_canary_verified_at: baseDrillEvidence().import_completed_at,
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("runtime canary");
  });

  it("blocks restore evidence from a different instance", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      scope: { ...baseDrillEvidence().scope, instance_id: "inst_other" },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("instance_id");
  });

  it("blocks import and canary timestamps outside the claimed RTO window", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      import_completed_at: "2026-07-05T00:00:04.000Z",
      runtime_canary_verified_at: "2026-07-05T00:00:05.000Z",
      canary_verification: {
        ...baseDrillEvidence().canary_verification,
        checked_at: "2026-07-05T00:00:05.000Z",
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("drill completion");
  });

  it("blocks mismatched canary and drill completion evidence timestamps", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      checked_at: "2026-07-04T00:00:04.000Z",
      canary_verification: {
        ...baseDrillEvidence().canary_verification,
        checked_at: "2026-07-04T00:00:04.500Z",
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("matching canary and drill timestamps");
  });

  it("blocks a self-consistent restore drill dated in the future", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      checked_at: "2099-07-04T00:00:05.000Z",
      rto: {
        ...baseDrillEvidence().rto,
        started_at: "2099-07-04T00:00:00.000Z",
        completed_at: "2099-07-04T00:00:05.000Z",
      },
      import_completed_at: "2099-07-04T00:00:04.000Z",
      runtime_canary_verified_at: "2099-07-04T00:00:05.000Z",
      canary_verification: {
        ...baseDrillEvidence().canary_verification,
        checked_at: "2099-07-04T00:00:05.000Z",
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("evaluation time");
  });

  it("blocks when RTO target exceeded", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      rto: {
        ...baseDrillEvidence().rto,
        duration_seconds: 99_999,
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
  });

  it("blocks when evidence inflates target_seconds beyond policy", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      rto: {
        ...baseDrillEvidence().rto,
        duration_seconds: 99_999,
        target_seconds: 999_999,
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("target_seconds");
  });

  it("blocks when target_seconds mismatches policy even with low duration", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      rto: {
        ...baseDrillEvidence().rto,
        duration_seconds: 5,
        target_seconds: 999_999,
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("target_seconds");
  });

  it("blocks when drill scope does not match recovery canary sentinels", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      scope: {
        ...baseDrillEvidence().scope,
        organization_id: "org_wrong_scope",
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("recovery canary constants");
  });

  it("blocks when canary variable_key does not match recovery canary sentinel", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      canary_verification: {
        ...baseDrillEvidence().canary_verification,
        variable_key: "WRONG_CANARY_KEY",
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("recovery canary constants");
  });

  it("blocks when reported duration underreports elapsed wall-clock from timestamps", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      rto: {
        started_at: "2026-07-04T00:00:00.000Z",
        completed_at: "2026-07-04T00:10:00.000Z",
        duration_seconds: 5,
        target_seconds: 8 * 60 * 60,
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("duration_seconds");
  });

  it("blocks when completed_at precedes started_at", () => {
    const evidence: RestoreDrillEvidence = {
      ...baseDrillEvidence(),
      rto: {
        started_at: "2026-07-04T00:10:00.000Z",
        completed_at: "2026-07-04T00:00:00.000Z",
        duration_seconds: 0,
        target_seconds: 8 * 60 * 60,
      },
    };
    const result = evaluateDrill(evidence);
    expect(result.status).toBe("blocked");
    expect(result.blocking_reason).toContain("started_at and completed_at");
  });

  it("computes elapsed seconds from drill timestamps", () => {
    expect(
      computeRestoreDrillElapsedSeconds({
        started_at: "2026-07-04T00:00:00.000Z",
        completed_at: "2026-07-04T00:00:05.000Z",
      }),
    ).toBe(5);
  });

  it("returns null for empty, unparseable, or negative drill timestamps", () => {
    expect(
      computeRestoreDrillElapsedSeconds({
        started_at: "",
        completed_at: "2026-07-04T00:00:05.000Z",
      }),
    ).toBeNull();
    expect(
      computeRestoreDrillElapsedSeconds({
        started_at: "not-a-date",
        completed_at: "2026-07-04T00:00:05.000Z",
      }),
    ).toBeNull();
    expect(
      computeRestoreDrillElapsedSeconds({
        started_at: "2026-07-04T00:00:05.000Z",
        completed_at: "2026-07-04T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
