import { environmentId, organizationId, projectId, secretId } from "./resource-ids.js";

/**
 * Durable identity of the recovery-canary sentinel scope (ADR-0058 / ADR-0072).
 *
 * The canary is standing instance-scope state, not a drill-day artifact: it is seeded at
 * instance bootstrap and re-captured by every scheduled export. Its existence is a precondition
 * of the first export because the daily backup Operation and its audit events are tenant-qualified
 * rows recorded under this organization, so the FK target must exist in every environment. The IDs
 * are fixed fixtures that prove a restore decrypts end-to-end; they are not production secrets.
 */
export const RECOVERY_CANARY_ORGANIZATION_ID = organizationId.brand(
  "org_01RCAN00000000000000000001",
);
export const RECOVERY_CANARY_PROJECT_ID = projectId.brand("prj_01RCAN00000000000000000002");
export const RECOVERY_CANARY_ENVIRONMENT_ID = environmentId.brand("env_01RCAN00000000000000000003");
export const RECOVERY_CANARY_SECRET_ID = secretId.brand("sec_01RCAN00000000000000000004");

/** Display name for the seeded recovery-canary organization row. */
export const RECOVERY_CANARY_ORGANIZATION_DISPLAY_NAME = "Recovery Canary" as const;
