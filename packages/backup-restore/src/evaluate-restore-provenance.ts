import type { BackupExportSuccessEvidence, RestoreDrillEvidence } from "./types.js";
import { parseIso } from "./parse-iso.js";

interface ProvenanceBlockingReason {
  summary: string;
  blockingReason: string;
}

interface RestoreTimeline {
  sourceExportTimestamp: number;
  drillStartedAt: number;
  importCompletedAt: number;
  runtimeCanaryVerifiedAt: number;
  canaryCheckedAt: number;
  drillCompletedAt: number;
}

function matchesSourceExport(
  evidence: RestoreDrillEvidence,
  source: BackupExportSuccessEvidence,
): boolean {
  return (
    evidence.scope.instance_id === source.instance_id &&
    evidence.artifact_ref === source.artifact_ref &&
    evidence.source_export_operation_id === source.operation_id &&
    evidence.source_export_timestamp === source.export_timestamp
  );
}

function parseRestoreTimeline(evidence: RestoreDrillEvidence): RestoreTimeline | null {
  const values = [
    parseIso(evidence.source_export_timestamp),
    parseIso(evidence.rto.started_at),
    parseIso(evidence.import_completed_at),
    parseIso(evidence.runtime_canary_verified_at),
    parseIso(evidence.canary_verification.checked_at),
    parseIso(evidence.rto.completed_at),
  ];
  if (values.some((value) => value === null)) {
    return null;
  }
  const [
    sourceExportTimestamp,
    drillStartedAt,
    importCompletedAt,
    runtimeCanaryVerifiedAt,
    canaryCheckedAt,
    drillCompletedAt,
  ] = values as [number, number, number, number, number, number];
  return {
    sourceExportTimestamp,
    drillStartedAt,
    importCompletedAt,
    runtimeCanaryVerifiedAt,
    canaryCheckedAt,
    drillCompletedAt,
  };
}

function hasValidChronology(timeline: RestoreTimeline, now: Date): boolean {
  return (
    timeline.sourceExportTimestamp <= timeline.drillStartedAt &&
    timeline.drillStartedAt <= timeline.importCompletedAt &&
    timeline.importCompletedAt < timeline.runtimeCanaryVerifiedAt &&
    timeline.runtimeCanaryVerifiedAt <= timeline.drillCompletedAt &&
    timeline.drillCompletedAt <= now.getTime() &&
    timeline.canaryCheckedAt === timeline.runtimeCanaryVerifiedAt
  );
}

export function evaluateRestoreProvenance(
  evidence: RestoreDrillEvidence,
  sourceExportEvidence: BackupExportSuccessEvidence | null,
  now: Date,
): ProvenanceBlockingReason | null {
  if (!sourceExportEvidence?.operation_id) {
    return {
      summary: "Restore drill is not linked to a scheduled export operation.",
      blockingReason: "matching backup export evidence with operation_id is required",
    };
  }

  if (!matchesSourceExport(evidence, sourceExportEvidence)) {
    return {
      summary: "Restore drill source does not match the scheduled R2 export evidence.",
      blockingReason:
        "instance_id, artifact_ref, source export operation, and source export timestamp must match export-success.json",
    };
  }

  const timeline = parseRestoreTimeline(evidence);
  if (
    !evidence.restore_target_ref ||
    timeline === null ||
    !hasValidChronology(timeline, now) ||
    evidence.checked_at !== evidence.rto.completed_at
  ) {
    return {
      summary: "Restore drill lacks consistent fresh Neon import and runtime canary chronology.",
      blockingReason:
        "source export <= drill start <= import completion < runtime canary <= drill completion <= evaluation time, with matching canary and drill timestamps, is required",
    };
  }

  return null;
}
