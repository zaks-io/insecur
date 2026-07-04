import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateBlockedBackupRestoreMetadataEvidence,
  evaluateExportFreshnessEvidence,
  evaluateRestoreDrillEvidence,
} from "./evaluate-readiness.js";
import {
  findBackupRestoreEvidenceViolations,
  parseMetadataSafeBackupRestoreEvidence,
} from "./assert-metadata-safe.js";
import { parseExportSuccessEvidence, parseRestoreDrillEvidence } from "./parse-evidence.js";

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function hasMetadataSafetyViolations(raw: unknown): boolean {
  return raw !== null && raw !== undefined && findBackupRestoreEvidenceViolations(raw).length > 0;
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

  const exportFresh = hasMetadataSafetyViolations(exportRaw)
    ? evaluateBlockedBackupRestoreMetadataEvidence("backup_restore.export_fresh", now)
    : evaluateExportFreshnessEvidence(
        parseMetadataSafeBackupRestoreEvidence(exportRaw, parseExportSuccessEvidence),
        now,
      );
  const restoreDrill = hasMetadataSafetyViolations(drillRaw)
    ? evaluateBlockedBackupRestoreMetadataEvidence("backup_restore.drill", now)
    : evaluateRestoreDrillEvidence(
        parseMetadataSafeBackupRestoreEvidence(drillRaw, parseRestoreDrillEvidence),
        now,
      );
  const ok = exportFresh.status === "passed" && restoreDrill.status === "passed";

  return { ok, exportFresh, restoreDrill };
}
