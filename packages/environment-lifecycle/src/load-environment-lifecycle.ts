import {
  ENVIRONMENT_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";

import { EnvironmentLifecycleError } from "./environment-lifecycle-error.js";

export async function loadEnvironmentLifecycle(
  organizationId: OrganizationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
) {
  const lifecycle = await withTenantScope({ kind: "organization", organizationId }, async (sql) =>
    new TenantEnvironmentLifecycleStore(sql).getByProjectCoordinate(
      organizationId,
      projectId,
      environmentId,
    ),
  );

  if (lifecycle === undefined) {
    throw new EnvironmentLifecycleError(ENVIRONMENT_ERROR_CODES.notFound, "environment not found");
  }

  return lifecycle;
}
