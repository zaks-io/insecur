import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import { BOOTSTRAP_ERROR_CODES, type OrganizationId, type UserId } from "@insecur/domain";
import { BootstrapError } from "./bootstrap-error.js";

export async function assertOwnerEffectiveAccessAfterClaim(
  userId: UserId,
  organizationId: OrganizationId,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(
    { type: "user", userId },
    { organizationId },
  );

  for (const scope of FIRST_VALUE_OWNER_SCOPES) {
    if (!hasAuthorizationScope(effectiveAccess, scope)) {
      throw new BootstrapError(
        BOOTSTRAP_ERROR_CODES.claimNotAvailable,
        "owner membership does not resolve required authorization scopes",
        organizationId,
      );
    }
  }
}
