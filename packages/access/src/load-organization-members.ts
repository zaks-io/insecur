import {
  membershipId,
  organizationId,
  parseDisplayName,
  projectId,
  userId,
  type DisplayName,
  type MembershipId,
  type OrganizationId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";
import { parseDbTimestamp, withTenantScope } from "@insecur/tenant-store";

/** Metadata-only membership row for the org People read: identifiers, role bundle, timestamp. */
export interface OrganizationMemberRow {
  membershipId: MembershipId;
  organizationId: OrganizationId;
  userId: UserId;
  /** From the member's user admission; null when none was recorded or it fails to parse. */
  displayName: DisplayName | null;
  rolePreset: string;
  /** Null for organization-tier memberships. */
  projectId: ProjectId | null;
  createdAt: Date;
}

interface OrganizationMemberQueryRow {
  id: string;
  org_id: string;
  user_id: string;
  role_preset: string;
  project_id: string | null;
  created_at: Date | string;
  display_name: string | null;
}

function toNullableDisplayName(raw: string | null): DisplayName | null {
  if (raw === null) {
    return null;
  }
  const parsed = parseDisplayName(raw);
  return parsed.ok ? parsed.value : null;
}

function mapOrganizationMemberRow(row: OrganizationMemberQueryRow): OrganizationMemberRow {
  return {
    membershipId: membershipId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    userId: userId.brand(row.user_id),
    displayName: toNullableDisplayName(row.display_name),
    rolePreset: row.role_preset,
    projectId: row.project_id === null ? null : projectId.brand(row.project_id),
    createdAt: parseDbTimestamp(row.created_at),
  };
}

/**
 * Every Membership row in one Organization with the member's Display Name, for the console People
 * read (INS-373). Runs org-scoped so forced RLS bounds the memberships read to the tenant; the
 * Display Name join reaches the instance-level user admission ledger through the org's own
 * `instance_id`, keyed only by user ids the tenant's membership rows already carry. Ordered by
 * Display Name then ids so the register is stable.
 */
export async function loadOrganizationMembers(
  orgId: OrganizationId,
): Promise<readonly OrganizationMemberRow[]> {
  return withTenantScope({ kind: "organization", organizationId: orgId }, async ({ sql }) => {
    const rows = await sql<OrganizationMemberQueryRow[]>`
      SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role_preset,
        m.project_id,
        m.created_at,
        ua.display_name
      FROM memberships m
      JOIN organizations o ON o.id = m.org_id
      LEFT JOIN user_admissions ua
        ON ua.user_id = m.user_id
        AND ua.instance_id = o.instance_id
        AND ua.status = ${"active"}
      WHERE m.org_id = ${orgId}
      ORDER BY ua.display_name NULLS LAST, m.user_id, m.id
    `;
    return rows.map(mapOrganizationMemberRow);
  });
}
