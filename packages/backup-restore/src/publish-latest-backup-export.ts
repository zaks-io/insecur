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

/** CAS conflicts mean another publisher is racing; each retry re-reads and re-guards, so a few
 * attempts always converge on the newest export. */
const MAX_POINTER_PUBLISH_ATTEMPTS = 4;

/**
 * Advances the latest-export pointer, refusing to regress it to an older export: overlapping
 * schedulers and replays may publish out of order, and "latest" must always mean the most recent
 * complete run. The recency check and the write form one compare-and-swap — an unconditional put
 * after the check could still land an older export last. ISO-8601 UTC timestamps compare
 * lexicographically. An unparseable current pointer is treated as absent so valid evidence can
 * repair it.
 */
export async function publishLatestBackupExport(
  storage: BackupExportStorage,
  exportEvidence: BackupExportSuccessEvidence,
): Promise<void> {
  assertBackupRestoreEvidenceIsMetadataSafe(exportEvidence);
  for (let attempt = 0; attempt < MAX_POINTER_PUBLISH_ATTEMPTS; attempt += 1) {
    const snapshot = await storage.getLatestEvidence();
    const current = parseSerializedEvidence(snapshot?.body ?? null);
    if (current !== null && current.export_timestamp > exportEvidence.export_timestamp) {
      return;
    }
    if (await storage.putLatestEvidence(serializeExportEvidence(exportEvidence), snapshot)) {
      return;
    }
  }
  throw new Error("latest-export pointer publish kept losing its compare-and-swap race");
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
