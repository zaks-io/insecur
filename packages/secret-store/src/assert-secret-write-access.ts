import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  type AuthorizationScope,
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

interface AssertSecretWriteAccessInput {
  requiredScope: AuthorizationScope;
  denialMessage: string;
  writeCoordinate: SecretWriteAccessCoordinate;
  effectiveAccess: EffectiveAccessResult | undefined;
  accessCoordinate: ResourceCoordinate | undefined;
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

function assertSecretWriteAccess(input: AssertSecretWriteAccessInput): void {
  const { requiredScope, denialMessage, writeCoordinate, effectiveAccess, accessCoordinate } =
    input;

  if (effectiveAccess === undefined || accessCoordinate === undefined) {
    throw new SecretWriteError(AUTH_ERROR_CODES.insufficientScope, denialMessage);
  }

  if (
    effectiveAccess.organizationId !== writeCoordinate.organizationId ||
    effectiveAccess.organizationId !== accessCoordinate.organizationId ||
    !hasRequiredWriteCoordinate(accessCoordinate) ||
    !coordinatesMatch(writeCoordinate, accessCoordinate) ||
    !hasAuthorizationScope(effectiveAccess, requiredScope)
  ) {
    throw new SecretWriteError(AUTH_ERROR_CODES.insufficientScope, denialMessage);
  }
}

export function assertSecretNonProtectedWriteAccess(
  writeCoordinate: SecretWriteAccessCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  assertSecretWriteAccess({
    requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    denialMessage: "secret non-protected write scope required",
    writeCoordinate,
    effectiveAccess,
    accessCoordinate,
  });
}

export function assertSecretProtectedDraftWriteAccess(
  writeCoordinate: SecretWriteAccessCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  assertSecretWriteAccess({
    requiredScope: AUTHORIZATION_SCOPES.secretProtectedDraftWrite,
    denialMessage: "secret protected draft write scope required",
    writeCoordinate,
    effectiveAccess,
    accessCoordinate,
  });
}
