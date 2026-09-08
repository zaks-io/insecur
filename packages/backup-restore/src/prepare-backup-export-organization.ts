import { ensureRecoveryCanaryOrganization, withTenantScope } from "@insecur/tenant-store";

import { RECOVERY_CANARY_ORGANIZATION_ID } from "./constants.js";

export async function prepareBackupExportOrganization(instanceId: string): Promise<void> {
  const organizationId = RECOVERY_CANARY_ORGANIZATION_ID;
  await withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    await ensureRecoveryCanaryOrganization(sql, instanceId);
    const rows = await sql<{ instance_id: string }[]>`
      SELECT instance_id FROM organizations WHERE id = ${organizationId}
    `;
    if (rows[0]?.instance_id !== instanceId) {
      throw new Error("recovery canary organization does not belong to the configured instance");
    }
  });
}
