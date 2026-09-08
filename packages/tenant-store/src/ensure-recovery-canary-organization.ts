import {
  RECOVERY_CANARY_ORGANIZATION_DISPLAY_NAME,
  RECOVERY_CANARY_ORGANIZATION_ID,
} from "@insecur/domain";

import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/** Backup Operations and audit events require this standing tenant before the first export. */
export async function ensureRecoveryCanaryOrganization(
  sql: TenantScopedSql,
  instanceId: string,
): Promise<void> {
  await sql`
    INSERT INTO organizations (id, instance_id, display_name)
    VALUES (
      ${RECOVERY_CANARY_ORGANIZATION_ID},
      ${instanceId},
      ${RECOVERY_CANARY_ORGANIZATION_DISPLAY_NAME}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}
