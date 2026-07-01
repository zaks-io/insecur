import { isBuiltInRolePreset, type BuiltInRolePreset } from "@insecur/access";
import {
  invitationId,
  organizationId,
  projectId,
  teamId,
  userId,
  type InvitationId,
  type MembershipId,
  type OrganizationId,
  type ProjectId,
  type TeamId,
  type UserId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { withTenantScope } from "@insecur/tenant-store";

export interface PendingInvitationRow {
  invitationId: InvitationId;
  organizationId: OrganizationId;
  teamId: TeamId;
  inviteeUserId: UserId;
  rolePreset: BuiltInRolePreset;
  projectId: ProjectId | null;
}

interface InvitationQueryRow {
  id: string;
  org_id: string;
  team_id: string;
  invitee_user_id: string;
  role_preset: string;
  project_id: string | null;
  status: string;
}

interface DefaultTeamRow {
  id: string;
}

function mapInvitationRow(row: InvitationQueryRow): PendingInvitationRow {
  if (!isBuiltInRolePreset(row.role_preset)) {
    throw new Error("invitation stores an invalid built-in role preset");
  }
  return {
    invitationId: invitationId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    teamId: teamId.brand(row.team_id),
    inviteeUserId: userId.brand(row.invitee_user_id),
    rolePreset: row.role_preset,
    projectId: row.project_id === null ? null : projectId.brand(row.project_id),
  };
}

export async function loadDefaultTeamId(orgId: OrganizationId): Promise<TeamId> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: orgId },
    async ({ sql }) => {
      return await sql<DefaultTeamRow[]>`
        SELECT id
        FROM teams
        WHERE org_id = ${orgId}
          AND is_default = true
        ORDER BY id
        LIMIT 1
      `;
    },
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error("organization has no default team");
  }
  return teamId.brand(row.id);
}

export async function insertPendingInvitation(input: {
  invitationId: InvitationId;
  organizationId: OrganizationId;
  teamId: TeamId;
  inviteeUserId: UserId;
  rolePreset: BuiltInRolePreset;
  projectId: ProjectId | null;
}): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      await sql`
        INSERT INTO invitations (
          id,
          org_id,
          team_id,
          invitee_user_id,
          role_preset,
          project_id,
          status
        )
        VALUES (
          ${input.invitationId},
          ${input.organizationId},
          ${input.teamId},
          ${input.inviteeUserId},
          ${input.rolePreset},
          ${input.projectId},
          ${"pending"}
        )
      `;
    },
  );
}

export async function loadPendingInvitation(
  orgId: OrganizationId,
  invId: InvitationId,
): Promise<PendingInvitationRow | null> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: orgId },
    async ({ sql }) => {
      return await sql<InvitationQueryRow[]>`
      SELECT id, org_id, team_id, invitee_user_id, role_preset, project_id, status
      FROM invitations
      WHERE id = ${invId}
        AND org_id = ${orgId}
      LIMIT 1
    `;
    },
  );
  const row = rows[0];
  if (row?.status !== "pending") {
    return null;
  }
  return mapInvitationRow(row);
}

export async function acceptInvitationInTransaction(
  sql: TenantScopedSql,
  input: {
    invitationId: InvitationId;
    organizationId: OrganizationId;
    acceptingUserId: UserId;
    grantedMembershipId: MembershipId;
  },
): Promise<PendingInvitationRow | null> {
  const consumed = await sql<InvitationQueryRow[]>`
    UPDATE invitations
    SET
      status = ${"accepted"},
      membership_id = ${input.grantedMembershipId},
      accepted_at = now()
    WHERE id = ${input.invitationId}
      AND org_id = ${input.organizationId}
      AND invitee_user_id = ${input.acceptingUserId}
      AND status = ${"pending"}
    RETURNING id, org_id, team_id, invitee_user_id, role_preset, project_id, status
  `;
  const row = consumed[0];
  if (row === undefined) {
    return null;
  }

  const invitation = mapInvitationRow(row);

  await sql`
    INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
    VALUES (
      ${input.grantedMembershipId},
      ${invitation.organizationId},
      ${invitation.teamId},
      ${input.acceptingUserId},
      ${invitation.rolePreset},
      ${invitation.projectId}
    )
  `;

  return invitation;
}

export async function membershipExistsForGrant(input: {
  organizationId: OrganizationId;
  userId: UserId;
  projectId: ProjectId | null;
}): Promise<boolean> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      if (input.projectId === null) {
        return await sql<{ id: string }[]>`
          SELECT id
          FROM memberships
          WHERE org_id = ${input.organizationId}
            AND user_id = ${input.userId}
            AND project_id IS NULL
          LIMIT 1
        `;
      }
      return await sql<{ id: string }[]>`
        SELECT id
        FROM memberships
        WHERE org_id = ${input.organizationId}
            AND user_id = ${input.userId}
            AND project_id = ${input.projectId}
          LIMIT 1
      `;
    },
  );
  return rows.length > 0;
}
