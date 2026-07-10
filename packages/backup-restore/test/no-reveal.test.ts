import { describe, expect, it } from "vitest";

import {
  assertBackupRestoreEvidenceIsMetadataSafe,
  findBackupRestoreEvidenceViolations,
  parseMetadataSafeBackupRestoreEvidence,
} from "../src/assert-metadata-safe.js";
import { parseExportSuccessEvidence } from "../src/parse-evidence.js";

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

  it("rejects raw evidence with reveal keys before projection", () => {
    const raw = {
      status: "passed",
      checked_at: "2026-07-04T00:00:00.000Z",
      instance_id: "inst_test",
      export_timestamp: "2026-07-04T00:00:00.000Z",
      root_key_version: 1,
      organization_count: 1,
      artifact_ref: "backup/latest-export.ibkp",
      artifact_sha256: "F3dYxqbVd3pBfVw1S73rUNra2RfN9GqYapKawP_0xJ4",
      encryption_verified: true,
      expires_at: "2026-07-06T00:00:00.000Z",
      secret: "must-not-appear",
    };

    expect(parseMetadataSafeBackupRestoreEvidence(raw, parseExportSuccessEvidence)).toBeNull();
    expect(findBackupRestoreEvidenceViolations(raw).length).toBeGreaterThan(0);
  });

  it.each(["ciphertext_b64url", "wrapped_dek", "payload_bytes", "body", "sealed_bytes"] as const)(
    "rejects package-native artifact field %s before projection",
    (forbiddenKey) => {
      const raw = {
        status: "passed",
        checked_at: "2026-07-04T00:00:00.000Z",
        instance_id: "inst_test",
        export_timestamp: "2026-07-04T00:00:00.000Z",
        root_key_version: 1,
        organization_count: 1,
        artifact_ref: "backup/latest-export.ibkp",
        artifact_sha256: "F3dYxqbVd3pBfVw1S73rUNra2RfN9GqYapKawP_0xJ4",
        encryption_verified: true,
        expires_at: "2026-07-06T00:00:00.000Z",
        [forbiddenKey]: "must-not-appear",
      };

      expect(parseMetadataSafeBackupRestoreEvidence(raw, parseExportSuccessEvidence)).toBeNull();
      expect(findBackupRestoreEvidenceViolations(raw).some((v) => v.includes(forbiddenKey))).toBe(
        true,
      );
    },
  );
});
