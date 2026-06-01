import type { OrganizationId, ProjectId } from "@insecur/domain";
import { membershipId, organizationId, projectId, userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import type { ActorRef } from "./resolve-effective-access.js";
import type { MembershipRow } from "./membership-row.js";

interface MembershipQueryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  user_id: string;
  role_preset: string;
}

export interface LoadMembershipsInput {
  actor: ActorRef;
  organizationId: OrganizationId;
  /** When set, organization-tier and matching project-tier rows are returned. */
  projectId?: ProjectId;
}

function mapMembershipRow(row: MembershipQueryRow): MembershipRow {
  return {
    membershipId: membershipId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    projectId: row.project_id === null ? null : projectId.brand(row.project_id),
    userId: userId.brand(row.user_id),
    rolePreset: row.role_preset,
  };
}

/**
 * Batch-reads applicable Membership rows for one actor inside one Organization.
 * Issues a single store round-trip per call.
 */
export async function loadActorMemberships(
  input: LoadMembershipsInput,
): Promise<readonly MembershipRow[]> {
  const actorUserId = input.actor.userId;

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const rows =
        input.projectId === undefined
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
                  OR project_id = ${input.projectId}
                )
              ORDER BY id
            `;
      return rows.map(mapMembershipRow);
    },
  );
}
