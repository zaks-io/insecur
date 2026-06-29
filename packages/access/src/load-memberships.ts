import type { OrganizationId, ProjectId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { mapMembershipRow, type MembershipQueryRow } from "./map-membership-row.js";
import type { MembershipRow } from "./membership-row.js";
import type { UserActorRef } from "./resolve-effective-access.js";

export interface LoadMembershipsInput {
  actor: UserActorRef;
  organizationId: OrganizationId;
  /**
   * Project IDs to include project-tier memberships for, via one `IN` read.
   * Empty means organization-tier memberships only (`project_id IS NULL`).
   */
  projectIds: readonly ProjectId[];
}

/**
 * Batch-reads applicable Membership rows for one actor inside one Organization.
 * Issues a single store round-trip per call.
 * @see docs/adr/0034-effective-access-resolver.md
 */
export async function loadActorMemberships(
  input: LoadMembershipsInput,
): Promise<readonly MembershipRow[]> {
  const actorUserId = input.actor.userId;
  const projectIds = input.projectIds;

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const rows =
        projectIds.length === 0
          ? await sql<MembershipQueryRow[]>`
              SELECT id, org_id, project_id, user_id, role_preset
              FROM memberships
              WHERE user_id = ${actorUserId}
                AND project_id IS NULL
              ORDER BY id
            `
          : await sql<MembershipQueryRow[]>`
              SELECT id, org_id, project_id, user_id, role_preset
              FROM memberships
              WHERE user_id = ${actorUserId}
                AND (
                  project_id IS NULL
                  OR project_id IN ${sql(projectIds)}
                )
              ORDER BY id
            `;
      return rows.map(mapMembershipRow);
    },
  );
}
