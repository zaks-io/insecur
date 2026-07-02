import {
  assertEnvironmentLifecycleUpdateAccess,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import { RuntimeInjectionPolicyError } from "./runtime-injection-policy-error.js";

export interface RuntimeInjectionPolicyAccessCoordinate {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
}

export function assertRuntimeInjectionPolicyConfigureAccess(
  policyCoordinate: RuntimeInjectionPolicyAccessCoordinate,
  effectiveAccess: EffectiveAccessResult | undefined,
  accessCoordinate: ResourceCoordinate | undefined,
): void {
  try {
    assertEnvironmentLifecycleUpdateAccess(
      {
        organizationId: policyCoordinate.organizationId,
        projectId: policyCoordinate.projectId,
        environmentId: policyCoordinate.environmentId,
      },
      effectiveAccess,
      accessCoordinate,
    );
  } catch {
    throw new RuntimeInjectionPolicyError(
      AUTH_ERROR_CODES.insufficientScope,
      "runtime injection policy configure scope required",
    );
  }
}
