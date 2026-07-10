import type { ReleaseGateControl, ReleaseGateProfile } from "./types.js";
import { blockedControl, missingControl, passedControl } from "./control-helpers.js";
import { evidencePath, readJsonFile } from "./read-evidence.js";
import {
  evaluateBlockedBackupRestoreMetadataEvidence,
  evaluateExportFreshnessEvidence,
  evaluateRestoreDrillEvidence,
  backupRestoreEvidenceDocs,
  findBackupRestoreEvidenceViolations,
  parseMetadataSafeBackupRestoreEvidence,
  type ReadinessEvaluation,
} from "@insecur/backup-restore";
import {
  parseExportSuccessEvidence,
  parseRestoreDrillEvidence,
} from "./parse-backup-restore-evidence.js";

function loadBackupRestoreEvidence<T>(
  evidenceDir: string,
  relativePath: string,
  parser: (value: unknown) => T | null,
): { evidence: T | null; metadataBlocked: boolean } {
  const raw = readJsonFile(evidencePath(evidenceDir, relativePath));
  if (raw === null) {
    return { evidence: null, metadataBlocked: false };
  }
  if (findBackupRestoreEvidenceViolations(raw).length > 0) {
    return { evidence: null, metadataBlocked: true };
  }
  return {
    evidence: parseMetadataSafeBackupRestoreEvidence(raw, parser),
    metadataBlocked: false,
  };
}

function evaluationToControl(
  evaluation: ReadinessEvaluation,
  relativePath: string,
  docs: string[],
): ReleaseGateControl {
  const refs: ReleaseGateControl["evidence"] = [{ kind: "runbook_drill", path: relativePath }];
  const input = {
    id: evaluation.control_id,
    docs,
    evidence: refs,
    checkedAt: evaluation.checked_at,
    summary: evaluation.summary,
  };

  if (evaluation.status === "passed") {
    return {
      ...passedControl(input),
      ...(evaluation.expires_at ? { expires_at: evaluation.expires_at } : {}),
    };
  }

  if (evaluation.status === "missing_evidence") {
    return missingControl(evaluation.control_id, evaluation.summary, docs, relativePath);
  }

  return blockedControl({
    ...input,
    summary: evaluation.blocking_reason ?? evaluation.summary,
  });
}

export function collectExportFreshControl(evidenceDir: string): ReleaseGateControl {
  const relativePath = "backup/export-success.json";
  const docs = backupRestoreEvidenceDocs();
  const loaded = loadBackupRestoreEvidence(evidenceDir, relativePath, parseExportSuccessEvidence);
  const evaluation = loaded.metadataBlocked
    ? evaluateBlockedBackupRestoreMetadataEvidence("backup_restore.export_fresh")
    : evaluateExportFreshnessEvidence(loaded.evidence);
  const control = evaluationToControl(evaluation, relativePath, docs);

  if (evaluation.expires_at) {
    return { ...control, expires_at: evaluation.expires_at };
  }

  return control;
}

export function collectRestoreDrillControl(evidenceDir: string): ReleaseGateControl {
  const relativePath = "backup/restore-drill.json";
  const docs = backupRestoreEvidenceDocs();
  const loaded = loadBackupRestoreEvidence(evidenceDir, relativePath, parseRestoreDrillEvidence);
  const sourceExport = loadBackupRestoreEvidence(
    evidenceDir,
    "backup/export-success.json",
    parseExportSuccessEvidence,
  );
  const evaluation = loaded.metadataBlocked
    ? evaluateBlockedBackupRestoreMetadataEvidence("backup_restore.drill")
    : evaluateRestoreDrillEvidence(
        loaded.evidence,
        new Date(),
        sourceExport.metadataBlocked ? null : sourceExport.evidence,
      );
  return evaluationToControl(evaluation, relativePath, docs);
}

export function collectBackupRestoreControls(
  evidenceDir: string,
  profile: ReleaseGateProfile,
): ReleaseGateControl[] {
  if (profile !== "small_group_production") {
    return [];
  }

  return [collectExportFreshControl(evidenceDir), collectRestoreDrillControl(evidenceDir)];
}
