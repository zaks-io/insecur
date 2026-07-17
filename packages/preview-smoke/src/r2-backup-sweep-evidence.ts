import { assertMetadataSafe } from "@insecur/domain";

/**
 * Metadata-only release-gate evidence for the R2 backup no-plaintext sweep (INS-562). The shape
 * must satisfy the `no_plaintext.r2_backup` registry entry in
 * `packages/release-gate/src/no-plaintext-surface-registry.ts`; sentinel values and object bytes
 * never appear here.
 */

export const R2_BACKUP_SWEEP_SURFACE = "r2_backup" as const;
export const R2_BACKUP_SWEEP_EVIDENCE_ADAPTER = "scheduled_r2_artifact_sweep" as const;
export const R2_BACKUP_SWEEP_EVIDENCE_RELATIVE_PATH = "no-plaintext/r2-backup.json" as const;

export interface R2BackupSweepEvidence extends Record<string, unknown> {
  artifact_sha256: string;
  checked_at: string;
  encodings_checked: string[];
  evidence_adapter: typeof R2_BACKUP_SWEEP_EVIDENCE_ADAPTER;
  expected_sha: string;
  export_timestamp: string;
  finding_count: 0;
  scanned_byte_count: number;
  scanned_object_count: number;
  schema_version: 1;
  sentinel_run_id: string;
  status: "passed";
  surface: typeof R2_BACKUP_SWEEP_SURFACE;
  target_ref: string;
}

export function buildR2BackupSweepEvidence(input: {
  artifactRef: string;
  artifactSha256: string;
  bucketName: string;
  checkedAt: string;
  encodingsChecked: string[];
  expectedSha: string;
  exportTimestamp: string;
  scannedByteCount: number;
  scannedObjectCount: number;
  sentinelRunId: string;
}): R2BackupSweepEvidence {
  const evidence: R2BackupSweepEvidence = {
    artifact_sha256: input.artifactSha256,
    checked_at: input.checkedAt,
    encodings_checked: input.encodingsChecked,
    evidence_adapter: R2_BACKUP_SWEEP_EVIDENCE_ADAPTER,
    expected_sha: input.expectedSha,
    export_timestamp: input.exportTimestamp,
    finding_count: 0,
    scanned_byte_count: input.scannedByteCount,
    scanned_object_count: input.scannedObjectCount,
    schema_version: 1,
    sentinel_run_id: input.sentinelRunId,
    status: "passed",
    surface: R2_BACKUP_SWEEP_SURFACE,
    target_ref: `r2://${input.bucketName}/${input.artifactRef}`,
  };
  assertMetadataSafe(evidence);
  return evidence;
}
