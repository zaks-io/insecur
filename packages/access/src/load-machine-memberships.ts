import type { OrganizationId, ProjectId } from "@insecur/domain";
import { machineIdentityId, membershipId, organizationId, projectId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { isAuthorizationScope, type AuthorizationScope } from "./authorization-scopes.js";
import type { MachineMembershipRow } from "./machine-membership-row.js";
import type { MachineActorRef } from "./resolve-effective-access.js";

interface MachineMembershipQueryRow {
  id: string;
  org_id: string;
  machine_identity_id: string;
  project_id: string;
  authorization_scopes: string[];
}

export interface LoadMachineMembershipsInput {
  actor: MachineActorRef;
  organizationId: OrganizationId;
  projectIds: readonly ProjectId[];
}

function mapAuthorizationScopes(rawScopes: readonly string[]): readonly AuthorizationScope[] {
  return rawScopes.filter(isAuthorizationScope);
}

function mapMachineMembershipRow(row: MachineMembershipQueryRow): MachineMembershipRow {
  return {
    membershipId: membershipId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    projectId: projectId.brand(row.project_id),
    machineIdentityId: machineIdentityId.brand(row.machine_identity_id),
    authorizationScopes: mapAuthorizationScopes(row.authorization_scopes),
  };
}

/**
 * Batch-reads project-scoped Machine Identity membership rows inside one Organization.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function loadMachineMemberships(
  input: LoadMachineMembershipsInput,
): Promise<readonly MachineMembershipRow[]> {
  const actorMachineIdentityId = input.actor.machineIdentityId;
  const projectIds = input.projectIds;

  if (projectIds.length === 0) {
    return [];
  }

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const rows = await sql<MachineMembershipQueryRow[]>`
        SELECT id, org_id, machine_identity_id, project_id, authorization_scopes
        FROM machine_identity_memberships
        WHERE org_id = ${input.organizationId}
          AND machine_identity_id = ${actorMachineIdentityId}
          AND project_id IN ${sql(projectIds)}
        ORDER BY id
      `;
      return rows.map(mapMachineMembershipRow);
    },
  );
}
