import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";

import { SecretWriteError } from "./secret-write-error.js";

export interface SecretWriteAccessCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

function coordinatesMatch(
  writeCoordinate: SecretWriteAccessCoordinate,
  accessCoordinate: ResourceCoordinate,
): boolean {
  if (accessCoordinate.organizationId !== writeCoordinate.organizationId) {
    return false;
  }
  if (
    accessCoordinate.projectId !== undefined &&
    accessCoordinate.projectId !== writeCoordinate.projectId
  ) {
    return false;
  }
  if (
    accessCoordinate.environmentId !== undefined &&
    accessCoordinate.environmentId !== writeCoordinate.environmentId
  ) {
    return false;
  }
  return true;
}

function hasRequiredWriteCoordinate(accessCoordinate: ResourceCoordinate): boolean {
  return accessCoordinate.projectId !== undefined && accessCoordinate.environmentId !== undefined;
}

/**
 * Validates pre-resolved Effective Access evidence for a non-protected Blind Secret Write.
 * Does not load Memberships or resolve Effective Access.
 */
export function assertSecretNonProtectedWriteAccess(
  writeCoordinate: SecretWriteAccessCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  if (effectiveAccess === undefined || accessCoordinate === undefined) {
    throw new SecretWriteError(
      AUTH_ERROR_CODES.insufficientScope,
      "secret non-protected write scope required",
    );
  }

  if (
    effectiveAccess.organizationId !== writeCoordinate.organizationId ||
    effectiveAccess.organizationId !== accessCoordinate.organizationId ||
    !hasRequiredWriteCoordinate(accessCoordinate) ||
    !coordinatesMatch(writeCoordinate, accessCoordinate) ||
    !hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.secretNonProtectedWrite)
  ) {
    throw new SecretWriteError(
      AUTH_ERROR_CODES.insufficientScope,
      "secret non-protected write scope required",
    );
  }
}
