import type { AuditActorRef, AuditRequestRef } from "@insecur/audit";
import { SECRET_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
  withTenantScope,
} from "@insecur/tenant-store";

import { recordSecretWriteAudit } from "./record-secret-write-audit.js";
import { SecretWriteError } from "./secret-write-error.js";

export interface SecretWriteCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

export interface AssertSecretWriteCoordinateInput extends SecretWriteCoordinate {
  actor: AuditActorRef;
  request?: AuditRequestRef;
}

/**
 * Proves the URL Environment belongs to the URL Project before any authorization or write, so a
 * project-scoped principal cannot persist into another project's Environment via a mismatched route
 * (INS-154). Mirrors the grant-issue coordinate check; the same invariant must hold for Blind
 * Secret Writes.
 *
 * Both not-found and not-owned collapse to `secret.coordinate_invalid` (HTTP 404) so the write path
 * cannot act as a cross-project existence oracle. A failed check is the exact cross-project probe we
 * most want to detect, so it records a denied-write audit before throwing, matching how the
 * injection path audits its coordinate denial.
 */
export async function assertSecretWriteCoordinate(
  input: AssertSecretWriteCoordinateInput,
): Promise<{ isProtected: boolean }> {
  try {
    return await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      ({ db }) =>
        assertProjectEnvironmentCoordinate(db, {
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
        }),
    );
  } catch (error) {
    if (error instanceof ProjectEnvironmentCoordinateError) {
      await recordSecretWriteAudit({
        outcome: "denied",
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
        ...(input.request !== undefined ? { request: input.request } : {}),
      }).catch(() => undefined);
      throw new SecretWriteError(
        SECRET_ERROR_CODES.coordinateInvalid,
        "project environment coordinate invalid",
      );
    }
    throw error;
  }
}
