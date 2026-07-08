import {
  ENVIRONMENT_ERROR_CODES,
  INJECTION_ERROR_CODES,
  isEnvironmentLifecycleStage,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import { InjectionGrantError } from "./injection-grant-error.js";
import type { GrantCoordinate } from "./resolve-injection-grant-bindings.js";
import type { RuntimeInjectionEnvironmentPosture } from "./resolve-runtime-injection-delivery-path.js";

function coordinateDenied(): never {
  throw new InjectionGrantError(
    INJECTION_ERROR_CODES.grantDenied,
    "project environment coordinate invalid",
  );
}

export async function loadRuntimeInjectionEnvironmentContext(
  coordinate: GrantCoordinate,
): Promise<RuntimeInjectionEnvironmentPosture> {
  return await withTenantScope(
    { kind: "organization", organizationId: coordinate.organizationId },
    async ({ sql }) => {
      const rows = await sql<
        {
          is_protected: boolean;
          lifecycle_stage: string;
        }[]
      >`
        SELECT is_protected, lifecycle_stage
        FROM environments
        WHERE org_id = ${coordinate.organizationId}
          AND id = ${coordinate.environmentId}
          AND project_id = ${coordinate.projectId}
        LIMIT 1
      `;
      const environment = rows[0];
      if (!environment) {
        coordinateDenied();
      }
      if (!isEnvironmentLifecycleStage(environment.lifecycle_stage)) {
        throw new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          `unsupported environment lifecycle stage (${ENVIRONMENT_ERROR_CODES.invalidLifecycleStage})`,
        );
      }
      return {
        isProtected: environment.is_protected,
        lifecycleStage: environment.lifecycle_stage,
      };
    },
  );
}
