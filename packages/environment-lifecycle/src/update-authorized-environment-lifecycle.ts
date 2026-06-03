import type { EffectiveAccessResult, ResourceCoordinate } from "@insecur/access";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import { applyEnvironmentLifecycleUpdate } from "./apply-environment-lifecycle-update.js";
import {
  assertEnvironmentLifecycleConfigureAccess,
  type EnvironmentLifecycleCoordinate,
} from "./assert-environment-lifecycle-access.js";
import {
  ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES,
  recordEnvironmentLifecycleAudit,
} from "./record-environment-lifecycle-audit.js";
import { runWithEnvironmentLifecycleAccessAudit } from "./run-with-environment-lifecycle-access-audit.js";
import type { EnvironmentLifecycleActorInput } from "./types.js";

export interface UpdateAuthorizedEnvironmentLifecycleInput extends EnvironmentLifecycleActorInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  lifecycleState?: import("@insecur/domain").EnvironmentLifecycleState;
  previewAutomationOptIn?: boolean;
  effectiveAccess?: EffectiveAccessResult;
  accessCoordinate?: ResourceCoordinate;
}

export async function updateAuthorizedEnvironmentLifecycle(
  input: UpdateAuthorizedEnvironmentLifecycleInput,
) {
  const coordinate: EnvironmentLifecycleCoordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  return runWithEnvironmentLifecycleAccessAudit(
    {
      actor: input.actor,
      coordinate,
      deniedEventCode: ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES.lifecycleUpdateDenied,
      ...(input.request !== undefined ? { request: input.request } : {}),
      assertAccess: () => {
        assertEnvironmentLifecycleConfigureAccess(
          coordinate,
          input.effectiveAccess,
          input.accessCoordinate,
        );
      },
    },
    async () => {
      const updated = await applyEnvironmentLifecycleUpdate({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.lifecycleState !== undefined ? { lifecycleState: input.lifecycleState } : {}),
        ...(input.previewAutomationOptIn !== undefined
          ? { previewAutomationOptIn: input.previewAutomationOptIn }
          : {}),
        ...(input.previewAutomationOptIn === true
          ? { previewAutomationOptInActorUserId: input.actor.userId }
          : {}),
      });

      await recordEnvironmentLifecycleAudit({
        outcome: "success",
        eventCode: ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES.lifecycleUpdated,
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.request !== undefined ? { request: input.request } : {}),
      });

      return updated;
    },
  );
}
