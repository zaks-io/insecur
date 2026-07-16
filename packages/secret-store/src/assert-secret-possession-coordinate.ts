import type { AuditActorRef, AuditRequestRef } from "@insecur/audit";
import { SECRET_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId, SecretId } from "@insecur/domain";
import { assertProjectEnvironmentCoordinateWithScope } from "@insecur/tenant-store";

import { recordDeniedPossessionCheckAudit } from "./record-possession-check-audit.js";
import { SecretWriteError } from "./secret-write-error.js";

export interface AssertSecretPossessionCoordinateInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId?: SecretId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
}

/**
 * Coordinate guard for possession checks: proves the URL Environment belongs to the URL Project
 * before any decrypt-compare, with the same `secret.coordinate_invalid` collapse as the write path
 * (no cross-project existence oracle, INS-154). Unlike `assertSecretWriteCoordinate`, a failed
 * check is attributed to the possession-specific `secret.possession_check_denied` audit code
 * (INS-528): a coordinate-invalid possession probe targets the guessing surface, not the write
 * surface, and must be searchable as one.
 */
export async function assertSecretPossessionCoordinate(
  input: AssertSecretPossessionCoordinateInput,
): Promise<{ isProtected: boolean }> {
  return assertProjectEnvironmentCoordinateWithScope({
    coordinate: input,
    onCoordinateDenied: () =>
      recordDeniedPossessionCheckAudit({
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
        reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
        ...(input.request !== undefined ? { request: input.request } : {}),
      }),
    createCoordinateError: () =>
      new SecretWriteError(
        SECRET_ERROR_CODES.coordinateInvalid,
        "project environment coordinate invalid for possession check",
      ),
  });
}
