import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { environments } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export class ProjectEnvironmentCoordinateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectEnvironmentCoordinateError";
  }
}

/**
 * Proves the Environment belongs to the Organization and Project before grant issue.
 */
export async function assertProjectEnvironmentCoordinate(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  },
): Promise<{ isProtected: boolean }> {
  const rows = await db
    .select({
      projectId: environments.projectId,
      isProtected: environments.isProtected,
    })
    .from(environments)
    .where(
      and(eq(environments.orgId, input.organizationId), eq(environments.id, input.environmentId)),
    )
    .limit(1);
  const environment = rows[0];
  if (!environment) {
    throw new ProjectEnvironmentCoordinateError("environment not found");
  }
  if (environment.projectId !== input.projectId) {
    throw new ProjectEnvironmentCoordinateError("environment does not belong to project");
  }
  return { isProtected: environment.isProtected };
}
