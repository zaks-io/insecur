import { describe, expect, it } from "vitest";

import {
  assertBackupRestoreEvidenceIsMetadataSafe,
  findBackupRestoreEvidenceViolations,
} from "../src/assert-metadata-safe.js";

describe("backup restore metadata safety", () => {
  it("rejects evidence containing forbidden reveal keys", () => {
    const violations = findBackupRestoreEvidenceViolations({
      status: "passed",
      secret: "must-not-appear",
    });
    expect(violations.some((entry) => entry.includes("forbidden metadata key"))).toBe(true);
  });

  it("rejects evidence containing recovery canary plaintext", () => {
    const violations = findBackupRestoreEvidenceViolations({
      summary: "insecur-recovery-canary-v1-sentinel",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("accepts metadata-only restore drill evidence", () => {
    expect(() => {
      assertBackupRestoreEvidenceIsMetadataSafe({
        status: "passed",
        actor: "ci:backup-restore-drill",
        scope: {
          instance_id: "inst_test",
          organization_id: "org_01RCAN00000000000000000001",
          project_id: "prj_01RCAN00000000000000000002",
        },
        canary_verification: {
          status: "passed",
          variable_key: "INSECUR_RECOVERY_CANARY",
        },
      });
    }).not.toThrow();
  });
});
