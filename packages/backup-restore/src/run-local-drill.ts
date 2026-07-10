import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

import { openBackupArtifact, sealBackupArtifact } from "./backup-envelope.js";
import { validateBackupEncryptionConfig } from "./backup-encryption-config.js";
import { RECOVERY_CANARY_ORGANIZATION_ID, BACKUP_EXPORT_FRESHNESS_HOURS } from "./constants.js";
import {
  buildRecoveryCanaryExportRow,
  findRecoveryCanaryRow,
  verifyRecoveryCanaryFromCiphertext,
} from "./recovery-canary.js";
import type { BackupFixtureSelfTestEvidence } from "./types.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";

export interface RunBackupFixtureSelfTestInput {
  evidenceDir: string;
  instanceId?: string;
  rootKeyBytes?: Uint8Array;
  startedAt?: Date;
}

export interface RunBackupFixtureSelfTestResult {
  evidence: BackupFixtureSelfTestEvidence;
  artifactPath: string;
}

function writeJsonEvidence(path: string, payload: unknown): void {
  assertBackupRestoreEvidenceIsMetadataSafe(payload);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function runBackupFixtureSelfTest(
  input: RunBackupFixtureSelfTestInput,
): Promise<RunBackupFixtureSelfTestResult> {
  const rootKeyBytes = input.rootKeyBytes ?? randomBytes(32);
  try {
    return await executeBackupFixtureSelfTest({ ...input, rootKeyBytes });
  } finally {
    if (!input.rootKeyBytes) {
      rootKeyBytes.fill(0);
    }
  }
}

async function executeBackupFixtureSelfTest(
  input: RunBackupFixtureSelfTestInput & { rootKeyBytes: Uint8Array },
): Promise<RunBackupFixtureSelfTestResult> {
  const instanceId = input.instanceId ?? "inst_backup_fixture_self_test";
  const rootKeyBytes = input.rootKeyBytes;
  const startedAt = input.startedAt ?? new Date();
  const exportTimestamp = startedAt.toISOString();
  const canaryRow = await buildRecoveryCanaryExportRow(rootKeyBytes);
  const jsonlPayload = new TextEncoder().encode(`${JSON.stringify(canaryRow)}\n`);
  const sealed = await sealBackupArtifact({
    instanceId,
    exportTimestamp,
    instanceSnapshotAt: exportTimestamp,
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
  const artifactPath = join(backupDir, "fixture-export.ibkp");
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

  const evidence: BackupFixtureSelfTestEvidence = {
    status:
      encryptionCheck.status === "passed" && canaryVerification.status === "passed"
        ? "passed"
        : "failed",
    checked_at: canaryVerification.checked_at,
    fixture_only: true,
    encryption_verified: encryptionCheck.status === "passed",
    canary_verified: canaryVerification.status === "passed",
    artifact_ref: "backup/fixture-export.ibkp",
  };

  writeJsonEvidence(join(input.evidenceDir, "backup/fixture-self-test.json"), evidence);

  return { evidence, artifactPath };
}

export function backupRestoreEvidenceDocs(): string[] {
  return [
    "docs/runbooks/neon-postgres-restore-from-encrypted-backup.md",
    "docs/adr/0058-minimal-backup-and-tested-restore.md",
    "docs/adr/0072-backup-export-pipeline-and-freshness.md",
    `docs/security-runbooks-and-release-gates.md (${String(BACKUP_EXPORT_FRESHNESS_HOURS)}h export freshness)`,
  ];
}
