import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import { SecretSyncError } from "./secret-sync-error.js";

export interface SecretSyncAccessCoordinate {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

export interface SecretSyncProjectAccessCoordinate {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

function coordinatesMatch(
  syncCoordinate: SecretSyncAccessCoordinate,
  accessCoordinate: ResourceCoordinate,
): boolean {
  if (accessCoordinate.organizationId !== syncCoordinate.organizationId) {
    return false;
  }
  if (
    accessCoordinate.projectId !== undefined &&
    accessCoordinate.projectId !== syncCoordinate.projectId
  ) {
    return false;
  }
  if (
    accessCoordinate.environmentId !== undefined &&
    accessCoordinate.environmentId !== syncCoordinate.environmentId
  ) {
    return false;
  }
  return true;
}

function hasRequiredCoordinate(accessCoordinate: ResourceCoordinate): boolean {
  return accessCoordinate.projectId !== undefined && accessCoordinate.environmentId !== undefined;
}

interface ScopeAssertionInput {
  readonly syncCoordinate: SecretSyncAccessCoordinate;
  readonly effectiveAccess: EffectiveAccessResult | undefined;
  readonly accessCoordinate: ResourceCoordinate | undefined;
  readonly requiredScope: (typeof AUTHORIZATION_SCOPES)[keyof typeof AUTHORIZATION_SCOPES];
  readonly message: string;
}

function assertScope(input: ScopeAssertionInput): void {
  if (
    input.effectiveAccess === undefined ||
    input.accessCoordinate === undefined ||
    input.effectiveAccess.organizationId !== input.syncCoordinate.organizationId ||
    input.effectiveAccess.organizationId !== input.accessCoordinate.organizationId ||
    !hasRequiredCoordinate(input.accessCoordinate) ||
    !coordinatesMatch(input.syncCoordinate, input.accessCoordinate) ||
    !hasAuthorizationScope(input.effectiveAccess, input.requiredScope)
  ) {
    throw new SecretSyncError(AUTH_ERROR_CODES.insufficientScope, input.message);
  }
}

interface ProjectScopeAssertionInput {
  readonly syncCoordinate: SecretSyncProjectAccessCoordinate;
  readonly effectiveAccess: EffectiveAccessResult | undefined;
  readonly accessCoordinate: ResourceCoordinate | undefined;
  readonly requiredScope: (typeof AUTHORIZATION_SCOPES)[keyof typeof AUTHORIZATION_SCOPES];
  readonly message: string;
}

function assertProjectScope(input: ProjectScopeAssertionInput): void {
  if (
    input.effectiveAccess === undefined ||
    input.accessCoordinate === undefined ||
    input.effectiveAccess.organizationId !== input.syncCoordinate.organizationId ||
    input.effectiveAccess.organizationId !== input.accessCoordinate.organizationId ||
    input.accessCoordinate.projectId === undefined ||
    input.accessCoordinate.projectId !== input.syncCoordinate.projectId ||
    !hasAuthorizationScope(input.effectiveAccess, input.requiredScope)
  ) {
    throw new SecretSyncError(AUTH_ERROR_CODES.insufficientScope, input.message);
  }
}

export async function resolveSecretSyncReadAccess(
  actor: Parameters<typeof resolveEffectiveAccess>[0],
  coordinate: SecretSyncAccessCoordinate,
): Promise<EffectiveAccessResult> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate);
  assertScope({
    syncCoordinate: coordinate,
    effectiveAccess,
    accessCoordinate: coordinate,
    requiredScope: AUTHORIZATION_SCOPES.syncRead,
    message: "secret sync read scope required",
  });
  return effectiveAccess;
}

export async function resolveSecretSyncProjectReadAccess(
  actor: Parameters<typeof resolveEffectiveAccess>[0],
  coordinate: SecretSyncProjectAccessCoordinate,
): Promise<EffectiveAccessResult> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate);
  assertProjectScope({
    syncCoordinate: coordinate,
    effectiveAccess,
    accessCoordinate: coordinate,
    requiredScope: AUTHORIZATION_SCOPES.syncRead,
    message: "secret sync read scope required",
  });
  return effectiveAccess;
}

export async function resolveSecretSyncManageAccess(
  actor: Parameters<typeof resolveEffectiveAccess>[0],
  coordinate: SecretSyncAccessCoordinate,
): Promise<EffectiveAccessResult> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate);
  assertScope({
    syncCoordinate: coordinate,
    effectiveAccess,
    accessCoordinate: coordinate,
    requiredScope: AUTHORIZATION_SCOPES.syncManage,
    message: "secret sync manage scope required",
  });
  return effectiveAccess;
}

export async function resolveSecretSyncRunAccess(
  actor: Parameters<typeof resolveEffectiveAccess>[0],
  coordinate: SecretSyncAccessCoordinate,
): Promise<EffectiveAccessResult> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate);
  assertScope({
    syncCoordinate: coordinate,
    effectiveAccess,
    accessCoordinate: coordinate,
    requiredScope: AUTHORIZATION_SCOPES.syncRun,
    message: "secret sync run scope required",
  });
  return effectiveAccess;
}
