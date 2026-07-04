import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { openBackupArtifact, sealBackupArtifact } from "./backup-envelope.js";
import { validateBackupEncryptionConfig } from "./backup-encryption-config.js";
import {
  BACKUP_EXPORT_FRESHNESS_HOURS,
  RECOVERY_CANARY_ORGANIZATION_ID,
  RESTORE_DRILL_RTO_TARGET_SECONDS,
} from "./constants.js";
import { computeExportExpiresAt, computeRestoreDrillElapsedSeconds } from "./evaluate-readiness.js";
import {
  buildRecoveryCanaryExportRow,
  findRecoveryCanaryRow,
  recoveryCanaryScope,
  verifyRecoveryCanaryFromCiphertext,
} from "./recovery-canary.js";
import type { BackupExportSuccessEvidence, RestoreDrillEvidence } from "./types.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";

export interface RunLocalRestoreDrillInput {
  evidenceDir: string;
  instanceId?: string;
  actor?: string;
  rootKeyBytes?: Uint8Array;
  restoreTargetRef?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface RunLocalRestoreDrillResult {
  exportEvidence: BackupExportSuccessEvidence;
  drillEvidence: RestoreDrillEvidence;
  artifactPath: string;
}

function durableDrillRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  for (let index = 0; index < root.byteLength; index += 1) {
    root[index] = (index * 7 + 11) % 256;
  }
  return root;
}

function writeJsonEvidence(path: string, payload: unknown): void {
  assertBackupRestoreEvidenceIsMetadataSafe(payload);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildDrillEvidence(input: {
  instanceId: string;
  actor: string;
  startedAt: Date;
  completedAt: Date;
  exportTimestamp: string;
  artifactRef: string;
  encryptionVerified: boolean;
  canaryStatus: "passed" | "failed";
  canaryCheckedAt: string;
  organizationCount: number;
  rootKeyVersion: number;
  restoreTargetRef?: string;
}): { exportEvidence: BackupExportSuccessEvidence; drillEvidence: RestoreDrillEvidence } {
  const checkedAt = input.completedAt.toISOString();
  const durationSeconds =
    computeRestoreDrillElapsedSeconds({
      started_at: input.startedAt.toISOString(),
      completed_at: checkedAt,
    }) ?? 0;

  const exportEvidence: BackupExportSuccessEvidence = {
    status: input.encryptionVerified ? "passed" : "failed",
    checked_at: checkedAt,
    instance_id: input.instanceId,
    export_timestamp: input.exportTimestamp,
    root_key_version: input.rootKeyVersion,
    organization_count: input.organizationCount,
    artifact_ref: input.artifactRef,
    encryption_verified: input.encryptionVerified,
    expires_at: computeExportExpiresAt(input.exportTimestamp),
  };

  const drillEvidence: RestoreDrillEvidence = {
    status: input.encryptionVerified && input.canaryStatus === "passed" ? "passed" : "failed",
    checked_at: checkedAt,
    actor: input.actor,
    scope: recoveryCanaryScope(input.instanceId),
    rto: {
      started_at: input.startedAt.toISOString(),
      completed_at: checkedAt,
      duration_seconds: durationSeconds,
      target_seconds: RESTORE_DRILL_RTO_TARGET_SECONDS,
    },
    canary_verification: {
      status: input.canaryStatus,
      checked_at: input.canaryCheckedAt,
      variable_key: "INSECUR_RECOVERY_CANARY",
    },
    encryption_verified: input.encryptionVerified,
    artifact_ref: input.artifactRef,
    ...(input.restoreTargetRef ? { restore_target_ref: input.restoreTargetRef } : {}),
  };

  return { exportEvidence, drillEvidence };
}

export async function runLocalRestoreDrill(
  input: RunLocalRestoreDrillInput,
): Promise<RunLocalRestoreDrillResult> {
  const instanceId = input.instanceId ?? "inst_local_restore_drill";
  const actor = input.actor ?? "ci:backup-restore-drill";
  const rootKeyBytes = input.rootKeyBytes ?? durableDrillRootKey();
  const startedAt = input.startedAt ?? new Date();
  const exportTimestamp = startedAt.toISOString();
  const canaryRow = await buildRecoveryCanaryExportRow(rootKeyBytes);
  const jsonlPayload = new TextEncoder().encode(`${JSON.stringify(canaryRow)}\n`);
  const sealed = await sealBackupArtifact({
    instanceId,
    exportTimestamp,
    rootKeyBytes,
    jsonlPayload,
    organizationSnapshots: [
      {
        organization_id: RECOVERY_CANARY_ORGANIZATION_ID,
        snapshot_at: exportTimestamp,
      },
    ],
  });

  const backupDir = join(input.evidenceDir, "backup");
  const artifactPath = join(backupDir, "latest-export.ibkp");
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(artifactPath, sealed);

  const opened = await openBackupArtifact({
    instanceId,
    rootKeyBytes,
    sealedBytes: sealed,
  });
  const encryptionCheck = validateBackupEncryptionConfig(opened.header, startedAt.toISOString());
  const canaryRowFromPayload = findRecoveryCanaryRow(opened.jsonlPayload);
  if (!canaryRowFromPayload) {
    throw new Error("recovery canary row missing from restored payload");
  }

  const canaryVerification = await verifyRecoveryCanaryFromCiphertext({
    rootKeyBytes,
    row: canaryRowFromPayload,
    checkedAt: new Date().toISOString(),
    instanceId,
  });

  const artifactRef = "backup/latest-export.ibkp";
  const { exportEvidence, drillEvidence } = buildDrillEvidence({
    instanceId,
    actor,
    startedAt,
    completedAt: input.completedAt ?? new Date(),
    exportTimestamp,
    artifactRef,
    encryptionVerified: encryptionCheck.status === "passed",
    canaryStatus: canaryVerification.status,
    canaryCheckedAt: canaryVerification.checked_at,
    organizationCount: opened.header.organization_snapshots.length,
    rootKeyVersion: opened.header.root_key_version,
    ...(input.restoreTargetRef ? { restoreTargetRef: input.restoreTargetRef } : {}),
  });

  writeJsonEvidence(join(input.evidenceDir, "backup/export-success.json"), exportEvidence);
  writeJsonEvidence(join(input.evidenceDir, "backup/restore-drill.json"), drillEvidence);

  return { exportEvidence, drillEvidence, artifactPath };
}

export function backupRestoreEvidenceDocs(): string[] {
  return [
    "docs/runbooks/neon-postgres-restore-from-encrypted-backup.md",
    "docs/adr/0058-minimal-backup-and-tested-restore.md",
    "docs/adr/0072-backup-export-pipeline-and-freshness.md",
    `docs/security-runbooks-and-release-gates.md (${String(BACKUP_EXPORT_FRESHNESS_HOURS)}h export freshness)`,
  ];
}
