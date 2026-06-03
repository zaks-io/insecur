import { organizationId, type OrganizationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

interface OrganizationRow {
  id: string;
}

/**
 * Returns the earliest Organization on an Instance for tenant-qualified instance-level audits.
 */
export async function loadInstanceAnchorOrganizationId(
  instanceId: string,
): Promise<OrganizationId> {
  const rows = await withTenantScope({ kind: "service" }, async (sql) => {
    return await sql<OrganizationRow[]>`
      SELECT id
      FROM organizations
      WHERE instance_id = ${instanceId}
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
