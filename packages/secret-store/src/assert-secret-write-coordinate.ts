import { SECRET_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
  withTenantScope,
} from "@insecur/tenant-store";

import { SecretWriteError } from "./secret-write-error.js";

export interface SecretWriteCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

/**
 * Proves the URL Environment belongs to the URL Project before any authorization or write, so a
 * project-scoped principal cannot persist into another project's Environment via a mismatched route
 * (INS-154). Mirrors the grant-issue coordinate check; the same invariant must hold for Blind
 * Secret Writes.
 *
 * Both not-found and not-owned collapse to `secret.coordinate_invalid` (HTTP 404) so the write path
 * cannot act as a cross-project existence oracle.
 */
export async function assertSecretWriteCoordinate(
  coordinate: SecretWriteCoordinate,
): Promise<{ isProtected: boolean }> {
  try {
    return await withTenantScope(
      { kind: "organization", organizationId: coordinate.organizationId },
      ({ db }) => assertProjectEnvironmentCoordinate(db, coordinate),
    );
  } catch (error) {
    if (error instanceof ProjectEnvironmentCoordinateError) {
      throw new SecretWriteError(
        SECRET_ERROR_CODES.coordinateInvalid,
        "project environment coordinate invalid",
      );
    }
    throw error;
  }
}
