import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assembleSecurityEvidenceBundle,
  assertBundleIsMetadataSafe,
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  SECURITY_CHECK_CONTROL_IDS,
  SMALL_GROUP_BACKUP_RESTORE_CONTROL_IDS,
} from "./index.js";

function writeEvidence(evidenceDir: string, relativePath: string, payload: unknown): void {
  const absolutePath = join(evidenceDir, relativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeBackupEvidence(evidenceDir: string): void {
  writeEvidence(evidenceDir, "backup/export-success.json", {
    status: "passed",
    checked_at: "2026-07-04T00:00:00.000Z",
    instance_id: "inst_test",
    export_timestamp: "2026-07-04T00:00:00.000Z",
    root_key_version: 1,
    organization_count: 1,
    artifact_ref: "backup/latest-export.ibkp",
    encryption_verified: true,
    expires_at: "2026-07-06T00:00:00.000Z",
  });
  writeEvidence(evidenceDir, "backup/restore-drill.json", {
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
  });
}

function writePassingEvidenceSet(evidenceDir: string): void {
  writeEvidence(evidenceDir, "verify.json", {
    status: "passed",
    command: "pnpm verify",
    checked_at: "2026-06-25T00:00:00.000Z",
    log_ref: "ci-logs/verify.txt",
  });
  writeEvidence(evidenceDir, "supply-chain/dependency-scan.json", {
    status: "passed",
    checked_at: "2026-06-25T00:00:00.000Z",
    summary: "Lockfile integrity check passed.",
    report_ref: "ci-artifacts/dependency-scan.json",
  });
  writeEvidence(evidenceDir, "supply-chain/secret-scan.json", {
    status: "passed",
    scanner: "gitleaks",
    checked_at: "2026-06-25T00:00:00.000Z",
    finding_count: 0,
    report_ref: "ci-artifacts/gitleaks-summary.json",
  });
  writeEvidence(evidenceDir, "supply-chain/sbom-vulnerability.json", {
    status: "passed",
    scanner: "syft+grype",
    checked_at: "2026-06-25T00:00:00.000Z",
    sbom_ref: "ci-artifacts/sbom.cyclonedx.json",
    vulnerability_count: 0,
    severity_counts: { critical: 0, high: 0, medium: 0, low: 0 },
  });
  writeEvidence(evidenceDir, "security/asvs-checklist.json", {
    status: "passed",
    checked_at: "2026-06-25T00:00:00.000Z",
    completed_items: 12,
    total_items: 12,
    checklist_ref: "docs/security-plan.md#asvs",
  });
  writeEvidence(evidenceDir, "security/api-top10-checklist.json", {
    status: "passed",
    checked_at: "2026-06-25T00:00:00.000Z",
    completed_items: 10,
    total_items: 10,
    checklist_ref: "docs/security-plan.md#api-top-10",
  });
}

// Backup export freshness compares real `now` against a 48h window derived from
// export_timestamp (2026-07-04T00:00Z → deadline 2026-07-06T00:00Z). Freeze a
// deterministic clock strictly inside that window so the fixed fixtures stay
// non-expired regardless of the real wall-clock date. The policy expiry is derived
// from export_timestamp (not now), so freezing here does not perturb the
// expires_at === policyExpiresAt equality the evaluator also asserts.
const FROZEN_NOW = new Date("2026-07-05T00:00:00.000Z");

describe("assembleSecurityEvidenceBundle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the documented bundle shape with skeleton control ids", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-"));
    writePassingEvidenceSet(evidenceDir);

    const bundle = assembleSecurityEvidenceBundle({
      evidenceDir,
      profile: "production_deploy",
      generatedAt: "2026-06-25T00:00:00.000Z",
    });

    expect(bundle.schema_version).toBe(EVIDENCE_BUNDLE_SCHEMA_VERSION);
    expect(bundle.profile).toBe("production_deploy");
    expect(bundle.generated_at).toBe("2026-06-25T00:00:00.000Z");
    expect(bundle.controls.map((control) => control.id)).toEqual([...SECURITY_CHECK_CONTROL_IDS]);

    for (const control of bundle.controls) {
      expect(typeof control.id).toBe("string");
      expect(["passed", "blocked", "missing_evidence"]).toContain(control.status);
      expect(typeof control.blocking).toBe("boolean");
      expect(typeof control.summary).toBe("string");
      expect(Array.isArray(control.evidence)).toBe(true);
    }
  });

  it("includes backup_restore controls for small_group_production", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-"));
    writePassingEvidenceSet(evidenceDir);
    writeBackupEvidence(evidenceDir);

    const bundle = assembleSecurityEvidenceBundle({
      evidenceDir,
      profile: "small_group_production",
      generatedAt: "2026-07-04T01:00:00.000Z",
    });

    expect(bundle.controls.map((control) => control.id)).toEqual([
      ...SECURITY_CHECK_CONTROL_IDS,
      ...SMALL_GROUP_BACKUP_RESTORE_CONTROL_IDS,
    ]);
    expect(bundle.ok).toBe(true);
  });

  it("blocks small_group_production when backup evidence is missing", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-"));
    writePassingEvidenceSet(evidenceDir);

    const bundle = assembleSecurityEvidenceBundle({
      evidenceDir,
      profile: "small_group_production",
    });

    expect(bundle.ok).toBe(false);
    const backupControls = bundle.controls.filter((control) =>
      control.id.startsWith("backup_restore."),
    );
    expect(backupControls.every((control) => control.status === "missing_evidence")).toBe(true);
  });

  it("blocks small_group_production when backup export evidence carries package-native key material fields", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-backup-native-"));
    writePassingEvidenceSet(evidenceDir);
    writeEvidence(evidenceDir, "backup/export-success.json", {
      status: "passed",
      checked_at: "2026-07-04T00:00:00.000Z",
      instance_id: "inst_test",
      export_timestamp: "2026-07-04T00:00:00.000Z",
      root_key_version: 1,
      organization_count: 1,
      artifact_ref: "backup/latest-export.ibkp",
      encryption_verified: true,
      expires_at: "2026-07-06T00:00:00.000Z",
      wrapped_dek: "must-not-appear",
    });
    writeEvidence(evidenceDir, "backup/restore-drill.json", {
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
    });

    const bundle = assembleSecurityEvidenceBundle({
      evidenceDir,
      profile: "small_group_production",
      generatedAt: "2026-07-04T01:00:00.000Z",
    });

    const exportFresh = bundle.controls.find(
      (control) => control.id === "backup_restore.export_fresh",
    );
    expect(bundle.ok).toBe(false);
    expect(exportFresh?.status).toBe("blocked");
  });

  it("passes when all required evidence is present and healthy", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-"));
    writePassingEvidenceSet(evidenceDir);

    const bundle = assembleSecurityEvidenceBundle({ evidenceDir });

    expect(bundle.ok).toBe(true);
    expect(bundle.status).toBe("passed");
    expect(bundle.controls.every((control) => control.status === "passed")).toBe(true);
    assertBundleIsMetadataSafe(bundle);
  });

  it("blocks when required evidence files are missing", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-"));

    const bundle = assembleSecurityEvidenceBundle({ evidenceDir });

    expect(bundle.ok).toBe(false);
    expect(bundle.status).toBe("blocked");
    expect(bundle.controls.every((control) => control.status === "missing_evidence")).toBe(true);
    expect(bundle.controls[0]?.blocking_reason).toContain("verify.json");
  });

  it("blocks when a security check failed", () => {
    const evidenceDir = mkdtempSync(join(tmpdir(), "insecur-release-gate-"));
    writePassingEvidenceSet(evidenceDir);
    writeEvidence(evidenceDir, "verify.json", {
      status: "failed",
      command: "pnpm verify",
      checked_at: "2026-06-25T00:00:00.000Z",
    });

    const bundle = assembleSecurityEvidenceBundle({ evidenceDir });
    const verify = bundle.controls.find((control) => control.id === "supply_chain.verify");

    expect(bundle.ok).toBe(false);
    expect(bundle.status).toBe("blocked");
    expect(verify?.status).toBe("blocked");
    expect(verify?.summary).toContain("failed");
  });
});
