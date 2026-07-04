import { BACKUP_EXPORT_FRESHNESS_HOURS, RESTORE_DRILL_RTO_TARGET_SECONDS } from "./constants.js";
import type {
  BackupExportSuccessEvidence,
  BackupRestoreEvidenceStatus,
  RestoreDrillEvidence,
} from "./types.js";

export interface ReadinessEvaluation {
  control_id: "backup_restore.export_fresh" | "backup_restore.drill";
  status: BackupRestoreEvidenceStatus;
  summary: string;
  checked_at: string;
  expires_at?: string;
  blocking_reason?: string;
}

function parseIso(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
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

  const expiresAtMs = parseIso(evidence.expires_at);
  if (expiresAtMs === null) {
    return blockedEvaluation({
      controlId,
      summary: "Backup export evidence is missing expires_at.",
      checkedAt,
      blockingReason: "expires_at is required for export freshness",
    });
  }

  if (expiresAtMs <= now.getTime()) {
    return blockedEvaluation({
      controlId,
      summary: `Latest successful export is older than ${String(BACKUP_EXPORT_FRESHNESS_HOURS)}h.`,
      checkedAt,
      blockingReason: "export freshness window expired",
      expiresAt: evidence.expires_at,
    });
  }

  return {
    control_id: controlId,
    status: "passed",
    summary: `Latest successful export is fresh (expires ${evidence.expires_at}).`,
    checked_at: checkedAt,
    expires_at: evidence.expires_at,
  };
}

export function computeExportExpiresAt(checkedAt: string): string {
  const base = Date.parse(checkedAt);
  return new Date(base + BACKUP_EXPORT_FRESHNESS_HOURS * 60 * 60 * 1000).toISOString();
}

export function evaluateRestoreDrillEvidence(
  evidence: RestoreDrillEvidence | null,
  now: Date = new Date(),
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

  if (evidence.rto.duration_seconds > evidence.rto.target_seconds) {
    return blockedEvaluation({
      controlId,
      summary: `Measured RTO ${String(evidence.rto.duration_seconds)}s exceeds target ${String(evidence.rto.target_seconds)}s.`,
      checkedAt,
      blockingReason: "RTO target exceeded",
    });
  }

  return {
    control_id: controlId,
    status: "passed",
    summary: `Restore drill passed in ${String(evidence.rto.duration_seconds)}s (target ${String(RESTORE_DRILL_RTO_TARGET_SECONDS)}s).`,
    checked_at: checkedAt,
  };
}
