import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import { withTenantScope } from "../with-tenant-scope.js";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
} from "./assert-project-environment-coordinate.js";

export interface ProjectEnvironmentCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

export interface AssertProjectEnvironmentCoordinateWithScopeOptions<TError extends Error> {
  coordinate: ProjectEnvironmentCoordinate;
  onCoordinateDenied?: () => Promise<unknown>;
  createCoordinateError: () => TError;
}

/**
 * Tenant-scoped project/environment coordinate proof with package-specific denial handling.
 * Callers supply audit recording and the error to throw so secret-write and grant-issue paths
 * share the same try/catch shape without coupling tenant-store to package error codes.
 */
export async function assertProjectEnvironmentCoordinateWithScope<TError extends Error>(
  options: AssertProjectEnvironmentCoordinateWithScopeOptions<TError>,
): Promise<{ isProtected: boolean }> {
  const { coordinate, onCoordinateDenied, createCoordinateError } = options;
  try {
    return await withTenantScope(
      { kind: "organization", organizationId: coordinate.organizationId },
      ({ db }) => assertProjectEnvironmentCoordinate(db, coordinate),
    );
  } catch (error) {
    if (error instanceof ProjectEnvironmentCoordinateError) {
      await onCoordinateDenied?.().catch(() => undefined);
      throw createCoordinateError();
    }
    throw error;
  }
}
