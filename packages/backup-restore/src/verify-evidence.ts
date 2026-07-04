import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateExportFreshnessEvidence,
  evaluateRestoreDrillEvidence,
} from "./evaluate-readiness.js";
import type { BackupExportSuccessEvidence, RestoreDrillEvidence } from "./types.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export interface VerifyBackupRestoreEvidenceOptions {
  evidenceDir: string;
  now?: Date;
}

export interface VerifyBackupRestoreEvidenceResult {
  ok: boolean;
  exportFresh: ReturnType<typeof evaluateExportFreshnessEvidence>;
  restoreDrill: ReturnType<typeof evaluateRestoreDrillEvidence>;
}

export function verifyBackupRestoreEvidence(
  options: VerifyBackupRestoreEvidenceOptions,
): VerifyBackupRestoreEvidenceResult {
  const evidenceDir = resolve(options.evidenceDir);
  const now = options.now ?? new Date();

  const exportRaw = readJsonFile(resolve(evidenceDir, "backup/export-success.json"));
  const drillRaw = readJsonFile(resolve(evidenceDir, "backup/restore-drill.json"));
  const exportEvidence = exportRaw === null ? null : (exportRaw as BackupExportSuccessEvidence);
  const drillEvidence = drillRaw === null ? null : (drillRaw as RestoreDrillEvidence);

  if (exportEvidence) {
    assertBackupRestoreEvidenceIsMetadataSafe(exportEvidence);
  }
  if (drillEvidence) {
    assertBackupRestoreEvidenceIsMetadataSafe(drillEvidence);
  }

  const exportFresh = evaluateExportFreshnessEvidence(exportEvidence, now);
  const restoreDrill = evaluateRestoreDrillEvidence(drillEvidence, now);
  const ok = exportFresh.status === "passed" && restoreDrill.status === "passed";

  return { ok, exportFresh, restoreDrill };
}
