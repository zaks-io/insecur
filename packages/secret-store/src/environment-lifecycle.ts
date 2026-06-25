import {
  assertEnvironmentLifecycleUpdateAccess,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import type { EnvironmentId, OrganizationId } from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  withTenantScope,
  type EnvironmentLifecycleRow,
  type UpdateEnvironmentLifecycleMetadataInput,
} from "@insecur/tenant-store";

export interface UpdateAuthorizedEnvironmentLifecycleInput extends UpdateEnvironmentLifecycleMetadataInput {
  effectiveAccess?: EffectiveAccessResult;
  accessCoordinate?: ResourceCoordinate;
}

/**
 * Updates metadata-safe Environment lifecycle fields after Effective Access validation.
 * Lifecycle stage and protected posture remain immutable after creation.
 */
export async function updateAuthorizedEnvironmentLifecycle(
  input: UpdateAuthorizedEnvironmentLifecycleInput,
): Promise<EnvironmentLifecycleRow> {
  assertEnvironmentLifecycleUpdateAccess(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    },
    input.effectiveAccess,
    input.accessCoordinate,
  );

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantEnvironmentLifecycleStore(db);
      return store.updateDisplayName({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        displayName: input.displayName,
      });
    },
  );
}

export interface GetEnvironmentLifecycleInput {
  organizationId: OrganizationId;
  environmentId: EnvironmentId;
}

export async function getEnvironmentLifecycle(
  input: GetEnvironmentLifecycleInput,
): Promise<EnvironmentLifecycleRow | null> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantEnvironmentLifecycleStore(db);
      return store.getById(input.organizationId, input.environmentId);
    },
  );
}
