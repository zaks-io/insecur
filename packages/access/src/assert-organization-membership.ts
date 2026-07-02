import { AUTH_ERROR_CODES, type OrganizationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import type { UserActorRef } from "./resolve-effective-access.js";

/**
 * Ensures the actor holds any membership row in the requested Organization before
 * tenant-scoped writes that only rely on `app.current_org` for isolation.
 */
export async function assertOrganizationMembership(
  actor: UserActorRef,
  organizationId: OrganizationId,
): Promise<void> {
  const hasMembership = await withTenantScope(
    { kind: "organization", organizationId },
    async ({ sql }) => {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM memberships
        WHERE user_id = ${actor.userId}
          AND org_id = ${organizationId}
        LIMIT 1
      `;
      return rows.length > 0;
    },
  );

  if (!hasMembership) {
    throw Object.assign(new Error("organization membership required"), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
}
