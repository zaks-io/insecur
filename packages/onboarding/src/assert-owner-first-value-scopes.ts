import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import { ONBOARDING_ERROR_CODES, type UserId } from "@insecur/domain";
import type { GuidedOrganizationResourceIds } from "./guided-organization-store.js";
import { GuidedOrganizationProvisionError } from "./provision-guided-organization-error.js";

export async function assertOwnerFirstValueScopes(
  userId: UserId,
  ids: GuidedOrganizationResourceIds,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(
    { type: "user", userId },
    { organizationId: ids.organizationId, projectId: ids.projectId },
  );

  for (const scope of FIRST_VALUE_OWNER_SCOPES) {
    if (!hasAuthorizationScope(effectiveAccess, scope)) {
      throw new GuidedOrganizationProvisionError(
        ONBOARDING_ERROR_CODES.resourceConflict,
        "owner membership does not resolve required First Value scopes",
        ids.organizationId,
      );
    }
  }
}
