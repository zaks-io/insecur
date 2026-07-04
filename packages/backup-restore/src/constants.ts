import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";

/** Marker recorded in backup export headers (ADR-0072). */
export const BACKUP_EXPORT_FORMAT_MARKER = "insecur-backup-v1" as const;

/** Recovery canary variable key — metadata-safe identifier, not a Sensitive Value. */
export const RECOVERY_CANARY_VARIABLE_KEY = "INSECUR_RECOVERY_CANARY" as const;

/**
 * Sentinel tenant scope for the recovery canary (ADR-0058). IDs are durable fixtures
 * used only to prove restore decrypts end-to-end; they are not production secrets.
 */
export const RECOVERY_CANARY_ORGANIZATION_ID = organizationId.brand(
  "org_01RCAN00000000000000000001",
);
export const RECOVERY_CANARY_PROJECT_ID = projectId.brand("prj_01RCAN00000000000000000002");
export const RECOVERY_CANARY_ENVIRONMENT_ID = environmentId.brand("env_01RCAN00000000000000000003");
export const RECOVERY_CANARY_SECRET_ID = secretId.brand("sec_01RCAN00000000000000000004");

/** Internal RTO target for same-business-day manual restore (ADR-0058), in seconds. */
export const RESTORE_DRILL_RTO_TARGET_SECONDS = 8 * 60 * 60;

/** Export freshness window for `backup_restore.export_fresh` (ADR-0072), in hours. */
export const BACKUP_EXPORT_FRESHNESS_HOURS = 48;
