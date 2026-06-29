import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  mapMembershipRow,
  type MembershipQueryRow,
  unionEffectiveAccessScopes,
} from "@insecur/access";
import { BOOTSTRAP_ERROR_CODES, type OrganizationId, type UserId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { BootstrapError } from "./bootstrap-error.js";

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
