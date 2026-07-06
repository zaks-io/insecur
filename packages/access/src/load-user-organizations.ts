import {
  organizationId,
  parseDisplayName,
  type DisplayName,
  type OrganizationId,
  type UserId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

/** Metadata-only organization row for the actor's own membership set. */
export interface UserOrganizationRow {
  organizationId: OrganizationId;
  displayName: DisplayName;
}

/** Raw columns returned by the cross-organization membership read. */
export interface UserOrganizationQueryRow {
  org_id: string;
  display_name: string;
}

export function mapUserOrganizationRow(row: UserOrganizationQueryRow): UserOrganizationRow {
  const parsed = parseDisplayName(row.display_name);
  if (!parsed.ok) {
    throw new Error(`organization ${row.org_id} has an invalid stored display name`);
  }
  return {
    organizationId: organizationId.brand(row.org_id),
    displayName: parsed.value,
  };
}

/**
 * The distinct Organizations one actor holds at least one Membership in (any tier), with Display
 * Names for the console org switcher and default-org resolution (INS-367). A self-read keyed
 * solely by the verified actor's own user id: it must see across organizations, so it runs under
 * service scope like admission resolution does, and returns only rows the memberships table
 * already ties to that actor. Ordered by Display Name then id so the first row is the stable
 * default organization.
 */
export async function loadUserOrganizations(
  actorUserId: UserId,
): Promise<readonly UserOrganizationRow[]> {
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = await sql<UserOrganizationQueryRow[]>`
      SELECT DISTINCT o.id AS org_id, o.display_name
      FROM memberships m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ${actorUserId}
      ORDER BY o.display_name, org_id
    `;
    return rows.map(mapUserOrganizationRow);
  });
}
