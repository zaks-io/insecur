import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_POSTURE_TIERS,
  type DisplayName,
  type EnvironmentId,
  type EnvironmentPostureTier,
  type OrganizationId,
  type ProjectId,
  resolveIsProtectedFromPosture,
  type PreviewNonProtectedOptDownEvidence,
} from "@insecur/domain";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";

import { EnvironmentLifecycleError } from "./environment-lifecycle-error.js";

export interface CreateEnvironmentLifecycleInput {
  environmentId: EnvironmentId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  displayName: DisplayName;
  postureTier: EnvironmentPostureTier;
  previewNonProtectedOptDown?: PreviewNonProtectedOptDownEvidence;
}

export async function createEnvironmentLifecycle(
  input: CreateEnvironmentLifecycleInput,
): Promise<void> {
  if (
    input.postureTier !== ENVIRONMENT_POSTURE_TIERS.preview &&
    input.previewNonProtectedOptDown !== undefined
  ) {
    throw new EnvironmentLifecycleError(
      ENVIRONMENT_ERROR_CODES.previewOptDownNotAllowed,
      "preview non-protected opt-down is only valid for preview environments",
    );
  }

  const isProtected = resolveIsProtectedFromPosture(
    input.postureTier,
    input.previewNonProtectedOptDown,
  );

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      await new TenantEnvironmentLifecycleStore(sql).insert({
        environmentId: input.environmentId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        displayName: input.displayName,
        postureTier: input.postureTier,
        isProtected,
        ...(input.previewNonProtectedOptDown !== undefined
          ? {
              previewNonProtectedOptDownAt: input.previewNonProtectedOptDown.optedDownAt,
              previewNonProtectedOptDownActorUserId: input.previewNonProtectedOptDown.actorUserId,
            }
          : {}),
      });
    },
  );
}
