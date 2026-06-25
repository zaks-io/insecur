import { AUTH_ERROR_CODES, ONBOARDING_ERROR_CODES } from "@insecur/domain";
import { isUniqueConstraintViolation } from "@insecur/tenant-store";
import {
  persistGuidedOrganization,
  type GuidedOrganizationResourceIds,
} from "./guided-organization-store.js";
import { mintGuidedOrganizationIds } from "./mint-guided-organization-ids.js";
import { recordProvisionSuccess } from "./provision-guided-organization-audit.js";
import { GuidedOrganizationProvisionError } from "./provision-guided-organization-error.js";
import type {
  ProvisionGuidedOrganizationInput,
  ProvisionGuidedOrganizationResult,
} from "./provision-guided-organization-types.js";
import { resolveProvisionDisplayNames } from "./resolve-provision-display-names.js";

export type {
  ProvisionGuidedOrganizationInput,
  ProvisionGuidedOrganizationResourceIds,
  ProvisionGuidedOrganizationResult,
} from "./provision-guided-organization-types.js";

function toProvisionResult(ids: GuidedOrganizationResourceIds): ProvisionGuidedOrganizationResult {
  return {
    organizationId: ids.organizationId,
    defaultTeamId: ids.defaultTeamId,
    ownerMembershipId: ids.ownerMembershipId,
    projectId: ids.projectId,
    developmentEnvironmentId: ids.developmentEnvironmentId,
  };
}

/**
 * Creates Personal Organization, Default Team, owner Membership, first Project,
 * and non-protected development Environment for an admitted User.
 */
export async function provisionGuidedOrganization(
  input: ProvisionGuidedOrganizationInput,
): Promise<ProvisionGuidedOrganizationResult> {
  if (!input.isAdmitted) {
    throw new GuidedOrganizationProvisionError(AUTH_ERROR_CODES.required, "user is not admitted");
  }

  const ids = mintGuidedOrganizationIds(input.resourceIds);
  const displayNames = resolveProvisionDisplayNames(input);

  try {
    await persistGuidedOrganization({
      ...ids,
      instanceId: input.instanceId,
      userId: input.userId,
      ...displayNames,
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    throw new GuidedOrganizationProvisionError(
      ONBOARDING_ERROR_CODES.resourceConflict,
      "guided organization resource id conflict",
      ids.organizationId,
    );
  }

  await recordProvisionSuccess(input, ids);
  return toProvisionResult(ids);
}
