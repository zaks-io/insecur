import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyBackupRestoreEvidence } from "../src/verify-evidence.js";

function writeEvidence(evidenceDir: string, relativePath: string, payload: string): void {
  const absolutePath = join(evidenceDir, relativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, payload, "utf8");
}

describe("verifyBackupRestoreEvidence", () => {
  it("returns missing evidence for partial restore-drill JSON without throwing", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-verify-"));
    writeEvidence(
      evidenceDir,
      "backup/restore-drill.json",
      JSON.stringify({
        status: "passed",
        encryption_verified: true,
      }),
    );

    const result = verifyBackupRestoreEvidence({ evidenceDir });
    expect(result.restoreDrill.status).toBe("missing_evidence");
    expect(result.ok).toBe(false);
  });

  it("returns missing evidence for malformed restore-drill JSON without throwing", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-verify-"));
    writeEvidence(evidenceDir, "backup/restore-drill.json", "{not-json");

    const result = verifyBackupRestoreEvidence({ evidenceDir });
    expect(result.restoreDrill.status).toBe("missing_evidence");
    expect(result.ok).toBe(false);
  });

  it("blocks otherwise-valid export evidence with extra reveal-bearing fields", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-verify-export-reveal-"));
    writeEvidence(
      evidenceDir,
      "backup/export-success.json",
      JSON.stringify({
        status: "passed",
        checked_at: "2026-07-04T00:00:00.000Z",
        instance_id: "inst_test",
        export_timestamp: "2026-07-04T00:00:00.000Z",
        root_key_version: 1,
        organization_count: 1,
        artifact_ref: "backup/latest-export.ibkp",
        encryption_verified: true,
        expires_at: "2026-07-06T00:00:00.000Z",
        plaintext: "must-not-appear",
      }),
    );

    const result = verifyBackupRestoreEvidence({
      evidenceDir,
      now: new Date("2026-07-04T01:00:00.000Z"),
    });
    expect(result.exportFresh.status).toBe("blocked");
    expect(result.exportFresh.blocking_reason).toContain("metadata-only");
    expect(result.ok).toBe(false);
  });

  it("blocks otherwise-valid restore-drill evidence with extra reveal-bearing fields", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-backup-verify-drill-reveal-"));
    writeEvidence(
      evidenceDir,
      "backup/restore-drill.json",
      JSON.stringify({
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
          target_seconds: 28800,
        },
        canary_verification: {
          status: "passed",
          checked_at: "2026-07-04T00:00:05.000Z",
          variable_key: "INSECUR_RECOVERY_CANARY",
        },
        encryption_verified: true,
        artifact_ref: "backup/latest-export.ibkp",
        ciphertext: "must-not-appear",
      }),
    );

    const result = verifyBackupRestoreEvidence({ evidenceDir });
    expect(result.restoreDrill.status).toBe("blocked");
    expect(result.restoreDrill.blocking_reason).toContain("metadata-only");
    expect(result.ok).toBe(false);
  });
});
