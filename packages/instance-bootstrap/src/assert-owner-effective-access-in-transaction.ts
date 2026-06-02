import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  unionEffectiveAccessScopes,
  type MembershipRow,
} from "@insecur/access";
import {
  BOOTSTRAP_ERROR_CODES,
  membershipId,
  organizationId,
  projectId,
  userId,
  type OrganizationId,
  type UserId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { BootstrapError } from "./bootstrap-error.js";

interface MembershipQueryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  user_id: string;
  role_preset: string;
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

export async function assertOwnerEffectiveAccessInTransaction(
  sql: TenantScopedSql,
  userId: UserId,
  targetOrganizationId: OrganizationId,
): Promise<void> {
  const rows = await sql<MembershipQueryRow[]>`
    SELECT id, org_id, project_id, user_id, role_preset
    FROM memberships
    WHERE org_id = ${targetOrganizationId}
      AND user_id = ${userId}
      AND project_id IS NULL
    ORDER BY id
  `;

  const scopes = unionEffectiveAccessScopes(rows.map(mapMembershipRow));
  const effectiveAccess = {
    organizationId: targetOrganizationId,
    scopes,
  };

  for (const scope of FIRST_VALUE_OWNER_SCOPES) {
    if (!hasAuthorizationScope(effectiveAccess, scope)) {
      throw new BootstrapError(
        BOOTSTRAP_ERROR_CODES.claimNotAvailable,
        "owner membership does not resolve required authorization scopes",
        targetOrganizationId,
      );
    }
  }
}
