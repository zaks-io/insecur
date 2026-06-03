import type { DisplayName, OrganizationId, TeamId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

export interface PersistOperatorOrganizationInput {
  instanceId: string;
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  organizationDisplayName: DisplayName;
  teamDisplayName: DisplayName;
}

export async function persistOperatorOrganization(
  input: PersistOperatorOrganizationInput,
): Promise<void> {
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`
      INSERT INTO organizations (id, instance_id, display_name)
      VALUES (${input.organizationId}, ${input.instanceId}, ${input.organizationDisplayName})
    `;
    await sql`
      INSERT INTO teams (id, org_id, display_name, is_default)
      VALUES (
        ${input.defaultTeamId},
        ${input.organizationId},
        ${input.teamDisplayName},
        true
      )
    `;
  });
}
