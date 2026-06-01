import { AUTH_ERROR_CODES, ONBOARDING_ERROR_CODES } from "@insecur/domain";
import { assertOwnerFirstValueScopes } from "./assert-owner-first-value-scopes.js";
import {
  findExistingOwnerOrganization,
  loadExistingGuidedOrganizationShape,
  persistGuidedOrganization,
  type GuidedOrganizationResourceIds,
} from "./guided-organization-store.js";
import { mintGuidedOrganizationIds } from "./mint-guided-organization-ids.js";
import {
  recordProvisionDenied,
  recordProvisionSuccess,
} from "./provision-guided-organization-audit.js";
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

async function tryIdempotentProvision(
  input: ProvisionGuidedOrganizationInput,
  ids: GuidedOrganizationResourceIds,
): Promise<ProvisionGuidedOrganizationResult | null> {
  if (input.resourceIds === undefined) {
    return null;
  }
  const existingShape = await loadExistingGuidedOrganizationShape(ids, input.userId);
  if (existingShape === null) {
    return null;
  }
  await assertOwnerFirstValueScopes(input.userId, existingShape);
  return toProvisionResult(existingShape);
}

async function denyWhenOwnerOrganizationExists(
  input: ProvisionGuidedOrganizationInput,
): Promise<void> {
  const existingOwner = await findExistingOwnerOrganization(input.instanceId, input.userId);
  if (existingOwner === null) {
    return;
  }

  const conflictsWithRequestedOrg =
    input.resourceIds !== undefined &&
    existingOwner.organizationId !== input.resourceIds.organizationId;

  if (!conflictsWithRequestedOrg && input.resourceIds !== undefined) {
    return;
  }

  await recordProvisionDenied(
    input,
    existingOwner.organizationId,
    ONBOARDING_ERROR_CODES.alreadyProvisioned,
  );
  throw new GuidedOrganizationProvisionError(
    ONBOARDING_ERROR_CODES.alreadyProvisioned,
    "user already has a guided organization",
    existingOwner.organizationId,
  );
}

async function persistAndAuditSuccess(
  input: ProvisionGuidedOrganizationInput,
  ids: GuidedOrganizationResourceIds,
): Promise<ProvisionGuidedOrganizationResult> {
  const displayNames = resolveProvisionDisplayNames(input);

  try {
    await persistGuidedOrganization({
      ...ids,
      instanceId: input.instanceId,
      userId: input.userId,
      ...displayNames,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const idempotent = await tryIdempotentProvision(input, ids);
    if (idempotent !== null) {
      return idempotent;
    }
    await recordProvisionDenied(input, ids.organizationId, ONBOARDING_ERROR_CODES.resourceConflict);
    throw new GuidedOrganizationProvisionError(
      ONBOARDING_ERROR_CODES.resourceConflict,
      "guided organization resource id conflict",
      ids.organizationId,
    );
  }

  await assertOwnerFirstValueScopes(input.userId, ids);
  await recordProvisionSuccess(input, ids);
  return toProvisionResult(ids);
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
  const idempotent = await tryIdempotentProvision(input, ids);
  if (idempotent !== null) {
    return idempotent;
  }

  await denyWhenOwnerOrganizationExists(input);
  return persistAndAuditSuccess(input, ids);
}
