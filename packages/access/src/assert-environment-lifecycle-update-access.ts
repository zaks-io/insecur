import {
  AUTH_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";

import { AUTHORIZATION_SCOPES } from "./authorization-scopes.js";
import type { EffectiveAccessResult, ResourceCoordinate } from "./resolve-effective-access.js";
import { hasAuthorizationScope } from "./has-authorization-scope.js";

export class EnvironmentLifecycleAccessError extends Error {
  readonly code = AUTH_ERROR_CODES.insufficientScope;

  constructor(message: string) {
    super(message);
    this.name = "EnvironmentLifecycleAccessError";
  }
}

export interface EnvironmentLifecycleAccessCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

function coordinatesMatch(
  lifecycleCoordinate: EnvironmentLifecycleAccessCoordinate,
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

function hasRequiredLifecycleCoordinate(accessCoordinate: ResourceCoordinate): boolean {
  return accessCoordinate.projectId !== undefined && accessCoordinate.environmentId !== undefined;
}

/**
 * Validates pre-resolved Effective Access for Environment lifecycle metadata updates.
 */
export function assertEnvironmentLifecycleUpdateAccess(
  lifecycleCoordinate: EnvironmentLifecycleAccessCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  if (effectiveAccess === undefined || accessCoordinate === undefined) {
    throw new EnvironmentLifecycleAccessError("environment lifecycle update scope required");
  }

  if (
    effectiveAccess.organizationId !== lifecycleCoordinate.organizationId ||
    effectiveAccess.organizationId !== accessCoordinate.organizationId ||
    !hasRequiredLifecycleCoordinate(accessCoordinate) ||
    !coordinatesMatch(lifecycleCoordinate, accessCoordinate) ||
    !hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.projectConfigure)
  ) {
    throw new EnvironmentLifecycleAccessError("environment lifecycle update scope required");
  }
}
