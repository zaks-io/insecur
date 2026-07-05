import { isBuiltInRolePreset, type BuiltInRolePreset } from "@insecur/access";
import {
  invitationId,
  organizationId,
  parseDisplayName,
  projectId,
  userId,
  type DisplayName,
  type InvitationId,
  type OrganizationId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";
import { parseDbTimestamp, withTenantScope } from "@insecur/tenant-store";

/**
 * Metadata-only pending invitation row for the org People read (INS-373). Invitees are
 * already-admitted users, so no token or acceptance secret exists on the model; the row carries
 * identifiers, the role bundle, status, and the created timestamp only.
 */
export interface PendingInvitationListRow {
  invitationId: InvitationId;
  organizationId: OrganizationId;
  inviteeUserId: UserId;
  /** From the invitee's user admission; null when none was recorded or it fails to parse. */
  inviteeDisplayName: DisplayName | null;
  rolePreset: BuiltInRolePreset;
  /** Null for organization-tier invitations. */
  projectId: ProjectId | null;
  status: "pending";
  createdAt: Date;
}

interface PendingInvitationListQueryRow {
  id: string;
  org_id: string;
  invitee_user_id: string;
  role_preset: string;
  project_id: string | null;
  created_at: Date | string;
  display_name: string | null;
}

function toNullableInviteeDisplayName(raw: string | null): DisplayName | null {
  if (raw === null) {
    return null;
  }
  const parsed = parseDisplayName(raw);
  return parsed.ok ? parsed.value : null;
}

function mapPendingInvitationListRow(row: PendingInvitationListQueryRow): PendingInvitationListRow {
  if (!isBuiltInRolePreset(row.role_preset)) {
    throw new Error("invitation stores an invalid built-in role preset");
  }
  return {
    invitationId: invitationId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    inviteeUserId: userId.brand(row.invitee_user_id),
    inviteeDisplayName: toNullableInviteeDisplayName(row.display_name),
    rolePreset: row.role_preset,
    projectId: row.project_id === null ? null : projectId.brand(row.project_id),
    status: "pending",
    createdAt: parseDbTimestamp(row.created_at),
  };
}

/**
 * Every pending Invitation in one Organization with the invitee's Display Name, for the console
 * People read (INS-373). Runs org-scoped so forced RLS bounds the invitations read to the tenant;
 * the Display Name join reaches the instance-level user admission ledger through the org's own
 * `instance_id`, keyed only by invitee ids the tenant's invitation rows already carry. Newest
 * first, id-tiebroken, so the register is stable.
 */
export async function listPendingInvitations(
  orgId: OrganizationId,
): Promise<readonly PendingInvitationListRow[]> {
  return withTenantScope({ kind: "organization", organizationId: orgId }, async ({ sql }) => {
    const rows = await sql<PendingInvitationListQueryRow[]>`
      SELECT
        i.id,
        i.org_id,
        i.invitee_user_id,
        i.role_preset,
        i.project_id,
        i.created_at,
        ua.display_name
      FROM invitations i
      JOIN organizations o ON o.id = i.org_id
      LEFT JOIN user_admissions ua
        ON ua.user_id = i.invitee_user_id
        AND ua.instance_id = o.instance_id
        AND ua.status = ${"active"}
      WHERE i.org_id = ${orgId}
        AND i.status = ${"pending"}
      ORDER BY i.created_at DESC, i.id
    `;
    return rows.map(mapPendingInvitationListRow);
  });
}
