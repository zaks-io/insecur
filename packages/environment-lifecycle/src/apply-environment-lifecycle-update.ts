import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STATES,
  canSetPreviewAutomationOptIn,
  type EnvironmentId,
  type EnvironmentLifecycleState,
  type OrganizationId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";

import { EnvironmentLifecycleError } from "./environment-lifecycle-error.js";

export interface ApplyEnvironmentLifecycleUpdateInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  lifecycleState?: EnvironmentLifecycleState;
  previewAutomationOptIn?: boolean;
  previewAutomationOptInActorUserId?: UserId;
}

function assertLifecycleTransition(
  currentState: EnvironmentLifecycleState,
  nextState: EnvironmentLifecycleState | undefined,
): void {
  if (nextState === undefined || nextState === currentState) {
    return;
  }
  if (
    currentState === ENVIRONMENT_LIFECYCLE_STATES.active &&
    nextState === ENVIRONMENT_LIFECYCLE_STATES.archived
  ) {
    return;
  }
  throw new EnvironmentLifecycleError(
    ENVIRONMENT_ERROR_CODES.invalidLifecycleTransition,
    "environment lifecycle transition is not allowed",
  );
}

export async function applyEnvironmentLifecycleUpdate(input: ApplyEnvironmentLifecycleUpdateInput) {
  const lifecycleUpdatedAt = new Date();

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const store = new TenantEnvironmentLifecycleStore(sql);
      const current = await store.getByProjectCoordinate(
        input.organizationId,
        input.projectId,
        input.environmentId,
      );
      if (current === undefined) {
        throw new EnvironmentLifecycleError(
          ENVIRONMENT_ERROR_CODES.notFound,
          "environment not found",
        );
      }

      assertLifecycleTransition(current.lifecycleState, input.lifecycleState);

      if (
        input.previewAutomationOptIn !== undefined &&
        !canSetPreviewAutomationOptIn(current.postureTier, current.isProtected)
      ) {
        throw new EnvironmentLifecycleError(
          ENVIRONMENT_ERROR_CODES.previewAutomationNotAllowed,
          "preview automation opt-in is only allowed for non-protected preview environments",
        );
      }

      return store.updateLifecycleMetadata(
        input.organizationId,
        input.projectId,
        input.environmentId,
        {
          ...(input.lifecycleState !== undefined ? { lifecycleState: input.lifecycleState } : {}),
          ...(input.previewAutomationOptIn !== undefined
            ? { previewAutomationOptIn: input.previewAutomationOptIn }
            : {}),
          lifecycleUpdatedAt,
          ...(input.previewAutomationOptInActorUserId !== undefined
            ? { previewAutomationOptInActorUserId: input.previewAutomationOptInActorUserId }
            : {}),
        },
      );
    },
  );
}
