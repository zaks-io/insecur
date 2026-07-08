import {
  organizationId,
  RECOVERY_CANARY_ORGANIZATION_ID,
  type OrganizationId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

interface OrganizationRow {
  id: string;
}

/**
 * Returns the earliest real Organization on an Instance for tenant-qualified instance-level audits.
 *
 * The recovery-canary sentinel org is seeded at bootstrap in the SAME transaction as the first real
 * org (ADR-0058 / ADR-0072), so both share `created_at` (transaction_timestamp()) and an
 * ORDER BY created_at tiebreak is arbitrary. The canary is a backup sentinel and must never be the
 * instance anchor, so it is excluded by id rather than trusted to lose an ambiguous ordering.
 */
export async function loadInstanceAnchorOrganizationId(
  instanceId: string,
): Promise<OrganizationId> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    return await sql<OrganizationRow[]>`
      SELECT id
      FROM organizations
      WHERE instance_id = ${instanceId}
        AND id <> ${RECOVERY_CANARY_ORGANIZATION_ID}
      ORDER BY created_at ASC
      LIMIT 1
    `;
  });
  const row = rows[0];
  if (row === undefined) {
    throw new Error("instance has no organization for audit qualification");
  }
  return organizationId.brand(row.id);
}
