import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateExportFreshnessEvidence,
  evaluateRestoreDrillEvidence,
} from "./evaluate-readiness.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";
import { parseExportSuccessEvidence, parseRestoreDrillEvidence } from "./parse-evidence.js";

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function parseMetadataSafeEvidence<T>(
  raw: unknown,
  parser: (value: unknown) => T | null,
): T | null {
  const parsed = parser(raw);
  if (!parsed) {
    return null;
  }

  try {
    assertBackupRestoreEvidenceIsMetadataSafe(parsed);
  } catch {
    return null;
  }

  return parsed;
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
  const exportEvidence = parseMetadataSafeEvidence(exportRaw, parseExportSuccessEvidence);
  const drillEvidence = parseMetadataSafeEvidence(drillRaw, parseRestoreDrillEvidence);

  const exportFresh = evaluateExportFreshnessEvidence(exportEvidence, now);
  const restoreDrill = evaluateRestoreDrillEvidence(drillEvidence, now);
  const ok = exportFresh.status === "passed" && restoreDrill.status === "passed";

  return { ok, exportFresh, restoreDrill };
}
