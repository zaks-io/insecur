import { BACKUP_EXPORT_FRESHNESS_HOURS, RESTORE_DRILL_RTO_TARGET_SECONDS } from "./constants.js";
import { restoreDrillEvidenceMatchesRecoveryCanarySentinel } from "./recovery-canary.js";
import { evaluateRestoreProvenance } from "./evaluate-restore-provenance.js";
import { parseIso } from "./parse-iso.js";
import type {
  BackupExportSuccessEvidence,
  BackupRestoreEvidenceStatus,
  RestoreDrillEvidence,
  RestoreDrillRtoMetadata,
} from "./types.js";

export interface ReadinessEvaluation {
  control_id: "backup_restore.export_fresh" | "backup_restore.drill";
  status: BackupRestoreEvidenceStatus;
  summary: string;
  checked_at: string;
  expires_at?: string;
  blocking_reason?: string;
}

/** Wall-clock elapsed seconds between drill timestamps; null when invalid or negative. */
export function computeRestoreDrillElapsedSeconds(input: {
  started_at: string;
  completed_at: string;
}): number | null {
  const startedMs = parseIso(input.started_at);
  const completedMs = parseIso(input.completed_at);
  if (startedMs === null || completedMs === null) {
    return null;
  }
  const elapsedMs = completedMs - startedMs;
  if (elapsedMs < 0) {
    return null;
  }
  return Math.floor(elapsedMs / 1000);
}

function blockedEvaluation(input: {
  controlId: ReadinessEvaluation["control_id"];
  summary: string;
  checkedAt: string;
  blockingReason: string;
  expiresAt?: string;
}): ReadinessEvaluation {
  return {
    control_id: input.controlId,
    status: "blocked",
    summary: input.summary,
    checked_at: input.checkedAt,
    blocking_reason: input.blockingReason,
    ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
  };
}

export function evaluateExportFreshnessEvidence(
  evidence: BackupExportSuccessEvidence | null,
  now: Date = new Date(),
): ReadinessEvaluation {
  const checkedAt = now.toISOString();
  const controlId = "backup_restore.export_fresh" as const;

  if (!evidence) {
    return {
      control_id: controlId,
      status: "missing_evidence",
      summary: "Latest backup export success evidence is missing.",
      checked_at: checkedAt,
      blocking_reason: "Expected metadata-only evidence at backup/export-success.json",
    };
  }

  if (evidence.status !== "passed" || !evidence.encryption_verified) {
    return blockedEvaluation({
      controlId,
      summary: "Latest backup export failed or encryption was not verified.",
      checkedAt,
      blockingReason: "encryption_verified must be true with status passed",
    });
  }

  const exportTimestampMs = parseIso(evidence.export_timestamp);
  if (exportTimestampMs === null) {
    return blockedEvaluation({
      controlId,
      summary: "Backup export evidence is missing export_timestamp.",
      checkedAt,
      blockingReason: "export_timestamp is required for export freshness",
    });
  }

  const policyExpiresAt = computeExportExpiresAt(evidence.export_timestamp);
  const expiresAtMs = parseIso(evidence.expires_at);
  if (expiresAtMs === null) {
    return blockedEvaluation({
      controlId,
      summary: "Backup export evidence is missing expires_at.",
      checkedAt,
      blockingReason: "expires_at is required for export freshness",
    });
  }

  if (evidence.expires_at !== policyExpiresAt) {
    return blockedEvaluation({
      controlId,
      summary: "Backup export evidence has invalid or inflated expires_at metadata.",
      checkedAt,
      blockingReason: "expires_at must equal policy value derived from export_timestamp",
      expiresAt: evidence.expires_at,
    });
  }

  const freshnessDeadlineMs = exportTimestampMs + BACKUP_EXPORT_FRESHNESS_HOURS * 60 * 60 * 1000;
  const futureDated = exportTimestampMs > now.getTime();
  if (futureDated || now.getTime() >= freshnessDeadlineMs) {
    return blockedEvaluation({
      controlId,
      summary: futureDated
        ? "Backup export evidence is future-dated."
        : `Latest successful export is older than ${String(BACKUP_EXPORT_FRESHNESS_HOURS)}h.`,
      checkedAt,
      blockingReason: futureDated
        ? "export_timestamp must not be later than the evaluation time"
        : "export freshness window expired",
      expiresAt: policyExpiresAt,
    });
  }

  return {
    control_id: controlId,
    status: "passed",
    summary: `Latest successful export is fresh (expires ${policyExpiresAt}).`,
    checked_at: checkedAt,
    expires_at: policyExpiresAt,
  };
}

export function computeExportExpiresAt(checkedAt: string): string {
  const base = Date.parse(checkedAt);
  return new Date(base + BACKUP_EXPORT_FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();
}

export function evaluateBlockedBackupRestoreMetadataEvidence(
  controlId: ReadinessEvaluation["control_id"],
  now: Date = new Date(),
): ReadinessEvaluation {
  const checkedAt = now.toISOString();
  return blockedEvaluation({
    controlId,
    summary: "Backup/restore evidence contains forbidden metadata keys or sensitive patterns.",
    checkedAt,
    blockingReason: "metadata-only evidence required",
  });
}

function evaluateRestoreDrillRtoBlockingReason(
  rto: RestoreDrillRtoMetadata,
): { summary: string; blockingReason: string } | null {
  if (rto.target_seconds !== RESTORE_DRILL_RTO_TARGET_SECONDS) {
    return {
      summary: "Restore drill evidence has invalid or inflated RTO target metadata.",
      blockingReason: `target_seconds must equal policy value ${String(RESTORE_DRILL_RTO_TARGET_SECONDS)}`,
    };
  }

  const computedDurationSeconds = computeRestoreDrillElapsedSeconds({
    started_at: rto.started_at,
    completed_at: rto.completed_at,
  });
  if (computedDurationSeconds === null) {
    return {
      summary: "Restore drill RTO timestamps are missing, invalid, or out of order.",
      blockingReason: "started_at and completed_at must define a non-negative elapsed range",
    };
  }

  if (rto.duration_seconds !== computedDurationSeconds) {
    return {
      summary: "Restore drill reported duration does not match elapsed wall-clock from timestamps.",
      blockingReason:
        "duration_seconds must equal elapsed seconds derived from started_at and completed_at",
    };
  }

  if (rto.duration_seconds > RESTORE_DRILL_RTO_TARGET_SECONDS) {
    return {
      summary: `Measured RTO ${String(rto.duration_seconds)}s exceeds target ${String(RESTORE_DRILL_RTO_TARGET_SECONDS)}s.`,
      blockingReason: "RTO target exceeded",
    };
  }

  return null;
}

export function evaluateRestoreDrillEvidence(
  evidence: RestoreDrillEvidence | null,
  now: Date = new Date(),
  sourceExportEvidence: BackupExportSuccessEvidence | null = null,
): ReadinessEvaluation {
  const checkedAt = now.toISOString();
  const controlId = "backup_restore.drill" as const;

  if (!evidence) {
    return {
      control_id: controlId,
      status: "missing_evidence",
      summary: "Restore drill evidence is missing.",
      checked_at: checkedAt,
      blocking_reason: "Expected metadata-only evidence at backup/restore-drill.json",
    };
  }

  if (!evidence.encryption_verified) {
    return blockedEvaluation({
      controlId,
      summary: "Restore drill did not verify backup encryption configuration.",
      checkedAt,
      blockingReason: "encryption_verified must be true",
    });
  }

  if (evidence.canary_verification.status !== "passed") {
    return blockedEvaluation({
      controlId,
      summary: "Recovery canary verification failed.",
      checkedAt,
      blockingReason: "canary_verification.status must be passed",
    });
  }

  if (evidence.status !== "passed") {
    return blockedEvaluation({
      controlId,
      summary: "Restore drill did not pass.",
      checkedAt,
      blockingReason: "restore drill status must be passed",
    });
  }

  const rtoBlocking = evaluateRestoreDrillRtoBlockingReason(evidence.rto);
  if (rtoBlocking) {
    return blockedEvaluation({
      controlId,
      summary: rtoBlocking.summary,
      checkedAt,
      blockingReason: rtoBlocking.blockingReason,
    });
  }

  if (!restoreDrillEvidenceMatchesRecoveryCanarySentinel(evidence)) {
    return blockedEvaluation({
      controlId,
      summary:
        "Restore drill evidence scope or canary metadata does not match recovery canary sentinels.",
      checkedAt,
      blockingReason:
        "scope and canary_verification.variable_key must match recovery canary constants",
    });
  }

  const provenanceBlocking = evaluateRestoreProvenance(evidence, sourceExportEvidence, now);
  if (provenanceBlocking) {
    return blockedEvaluation({
      controlId,
      summary: provenanceBlocking.summary,
      checkedAt,
      blockingReason: provenanceBlocking.blockingReason,
    });
  }

  return {
    control_id: controlId,
    status: "passed",
    summary: `Restore drill passed in ${String(evidence.rto.duration_seconds)}s (target ${String(RESTORE_DRILL_RTO_TARGET_SECONDS)}s).`,
    checked_at: checkedAt,
  };
}
