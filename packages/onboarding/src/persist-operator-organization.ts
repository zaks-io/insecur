import type { DisplayName, OrganizationId, TeamId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

export interface PersistOperatorOrganizationInput {
  instanceId: string;
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  organizationDisplayName: DisplayName;
  teamDisplayName: DisplayName;
}

/**
 * Inserts the operator organization and its default team on the caller's
 * tenant-scoped transaction, so the caller can commit the success audit
 * atomically with the organization authority change.
 */
export async function persistOperatorOrganizationInTransaction(
  sql: TenantScopedSql,
  input: PersistOperatorOrganizationInput,
): Promise<void> {
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
}
