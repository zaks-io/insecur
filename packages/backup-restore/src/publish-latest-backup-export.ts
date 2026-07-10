import { buildBackupExportEvidenceKey } from "./artifact-refs.js";
import { assertBackupRestoreEvidenceIsMetadataSafe } from "./assert-metadata-safe.js";
import { serializeExportEvidence, type BackupExportStorage } from "./backup-export-storage.js";
import { parseExportSuccessEvidence } from "./parse-evidence.js";
import type { BackupExportSuccessEvidence } from "./types.js";

/**
 * A failure advancing the latest-export pointer after the Operation already reached its terminal
 * `succeeded` state. It must never route through the export-failed path: the run's artifact,
 * evidence, and audit trail are all durable and correct — only the pointer is stale, and a replay
 * of the same scheduled run repairs it (see runBackupExport).
 */
export class BackupExportPointerPublishError extends Error {
  constructor(cause: unknown) {
    super("backup export succeeded but publishing the latest-export pointer failed", { cause });
    this.name = "BackupExportPointerPublishError";
  }
}

function parseSerializedEvidence(serialized: string | null): BackupExportSuccessEvidence | null {
  if (serialized === null) {
    return null;
  }
  try {
    return parseExportSuccessEvidence(JSON.parse(serialized));
  } catch {
    return null;
  }
}

/**
 * Advances the latest-export pointer, refusing to regress it to an older export: overlapping
 * schedulers and replays may publish out of order, and "latest" must always mean the most recent
 * complete run. ISO-8601 UTC timestamps compare lexicographically. An unparseable current pointer
 * is treated as absent so valid evidence can repair it.
 */
export async function publishLatestBackupExport(
  storage: BackupExportStorage,
  exportEvidence: BackupExportSuccessEvidence,
): Promise<void> {
  assertBackupRestoreEvidenceIsMetadataSafe(exportEvidence);
  const current = parseSerializedEvidence(await storage.getLatestEvidence());
  if (current !== null && current.export_timestamp > exportEvidence.export_timestamp) {
    return;
  }
  await storage.putLatestEvidence(serializeExportEvidence(exportEvidence));
}

/**
 * Re-publishes the latest-export pointer from the durable per-run evidence object. This makes the
 * pointer advance re-runnable for an already-succeeded Operation whose original run failed after
 * success but before the pointer was confirmed advanced.
 */
export async function republishLatestBackupExport(
  storage: BackupExportStorage,
  exportIdentity: string,
): Promise<void> {
  const serialized = await storage.getEvidence(buildBackupExportEvidenceKey(exportIdentity));
  const evidence = parseSerializedEvidence(serialized);
  if (evidence === null) {
    throw new Error(
      `durable export evidence for succeeded backup export ${exportIdentity} is missing or invalid`,
    );
  }
  await publishLatestBackupExport(storage, evidence);
}
