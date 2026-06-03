import type { EffectiveAccessResult, ResourceCoordinate } from "@insecur/access";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import {
  assertEnvironmentLifecycleReadAccess,
  type EnvironmentLifecycleCoordinate,
} from "./assert-environment-lifecycle-access.js";
import { loadEnvironmentLifecycle } from "./load-environment-lifecycle.js";
import {
  ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES,
  recordEnvironmentLifecycleAudit,
} from "./record-environment-lifecycle-audit.js";
import { runWithEnvironmentLifecycleAccessAudit } from "./run-with-environment-lifecycle-access-audit.js";
import type { EnvironmentLifecycleActorInput } from "./types.js";

export interface GetAuthorizedEnvironmentLifecycleInput extends EnvironmentLifecycleActorInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  effectiveAccess?: EffectiveAccessResult;
  accessCoordinate?: ResourceCoordinate;
}

export async function getAuthorizedEnvironmentLifecycle(
  input: GetAuthorizedEnvironmentLifecycleInput,
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
      deniedEventCode: ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES.lifecycleReadDenied,
      ...(input.request !== undefined ? { request: input.request } : {}),
      assertAccess: () => {
        assertEnvironmentLifecycleReadAccess(
          coordinate,
          input.effectiveAccess,
          input.accessCoordinate,
        );
      },
    },
    async () => {
      const lifecycle = await loadEnvironmentLifecycle(
        input.organizationId,
        input.projectId,
        input.environmentId,
      );

      await recordEnvironmentLifecycleAudit({
        outcome: "success",
        eventCode: ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES.lifecycleRead,
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.request !== undefined ? { request: input.request } : {}),
      });

      return lifecycle;
    },
  );
}
