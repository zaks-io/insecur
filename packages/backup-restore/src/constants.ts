/** Marker recorded in backup export headers (ADR-0072). */
export const BACKUP_EXPORT_FORMAT_MARKER = "insecur-backup-v1" as const;

/** Preview-only R2 signal consumed once by the frequent no-op proof trigger. */
export const BACKUP_EXPORT_PROOF_REQUEST_KEY = "backup/proof-requested" as const;

export const BACKUP_EXPORT_PROOF_REQUEST_VERSION = 1 as const;

export interface BackupExportProofRequest {
  notBefore: number;
  requestId: string;
  status: "requested";
  version: typeof BACKUP_EXPORT_PROOF_REQUEST_VERSION;
}

/** Recovery canary variable key — metadata-safe identifier, not a Sensitive Value. */
export const RECOVERY_CANARY_VARIABLE_KEY = "INSECUR_RECOVERY_CANARY" as const;

/**
 * Sentinel tenant scope for the recovery canary (ADR-0058 / ADR-0072). The durable identity lives
 * in `@insecur/domain` so the bootstrap and preview seed paths can provision the sentinel
 * organization as standing state without depending on this package; re-exported here to keep the
 * backup package's public surface stable.
 */
export {
  RECOVERY_CANARY_ORGANIZATION_ID,
  RECOVERY_CANARY_PROJECT_ID,
  RECOVERY_CANARY_ENVIRONMENT_ID,
  RECOVERY_CANARY_SECRET_ID,
} from "@insecur/domain";

/** Internal RTO target for same-business-day manual restore (ADR-0058), in seconds. */
export const RESTORE_DRILL_RTO_TARGET_SECONDS = 8 * 60 * 60;

/** Export freshness window for `backup_restore.export_fresh` (ADR-0072), in hours. */
export const BACKUP_EXPORT_FRESHNESS_HOURS = 48;
