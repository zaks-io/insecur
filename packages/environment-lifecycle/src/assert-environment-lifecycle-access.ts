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

import { EnvironmentLifecycleError } from "./environment-lifecycle-error.js";

export interface EnvironmentLifecycleCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

function coordinatesMatch(
  lifecycleCoordinate: EnvironmentLifecycleCoordinate,
  accessCoordinate: ResourceCoordinate,
): boolean {
  if (accessCoordinate.organizationId !== lifecycleCoordinate.organizationId) {
    return false;
  }
  if (
    accessCoordinate.projectId !== undefined &&
    accessCoordinate.projectId !== lifecycleCoordinate.projectId
  ) {
    return false;
  }
  if (
    accessCoordinate.environmentId !== undefined &&
    accessCoordinate.environmentId !== lifecycleCoordinate.environmentId
  ) {
    return false;
  }
  return true;
}

function hasRequiredCoordinate(accessCoordinate: ResourceCoordinate): boolean {
  return accessCoordinate.projectId !== undefined && accessCoordinate.environmentId !== undefined;
}

export function assertEnvironmentLifecycleReadAccess(
  coordinate: EnvironmentLifecycleCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  if (effectiveAccess === undefined || accessCoordinate === undefined) {
    throw new EnvironmentLifecycleError(
      AUTH_ERROR_CODES.insufficientScope,
      "environment read scope required",
    );
  }

  if (
    effectiveAccess.organizationId !== coordinate.organizationId ||
    effectiveAccess.organizationId !== accessCoordinate.organizationId ||
    !hasRequiredCoordinate(accessCoordinate) ||
    !coordinatesMatch(coordinate, accessCoordinate) ||
    !hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.environmentRead)
  ) {
    throw new EnvironmentLifecycleError(
      AUTH_ERROR_CODES.insufficientScope,
      "environment read scope required",
    );
  }
}

export function assertEnvironmentLifecycleConfigureAccess(
  coordinate: EnvironmentLifecycleCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  if (effectiveAccess === undefined || accessCoordinate === undefined) {
    throw new EnvironmentLifecycleError(
      AUTH_ERROR_CODES.insufficientScope,
      "project configure scope required",
    );
  }

  if (
    effectiveAccess.organizationId !== coordinate.organizationId ||
    effectiveAccess.organizationId !== accessCoordinate.organizationId ||
    !hasRequiredCoordinate(accessCoordinate) ||
    !coordinatesMatch(coordinate, accessCoordinate) ||
    !hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.projectConfigure)
  ) {
    throw new EnvironmentLifecycleError(
      AUTH_ERROR_CODES.insufficientScope,
      "project configure scope required",
    );
  }
}
