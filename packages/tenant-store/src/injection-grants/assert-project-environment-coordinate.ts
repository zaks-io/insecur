import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";

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
  sql: TenantScopedSql,
  input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  },
): Promise<{ isProtected: false }> {
  const rows = await sql<{ project_id: string; is_protected: boolean }[]>`
    SELECT project_id, is_protected
    FROM environments
    WHERE org_id = ${input.organizationId}
      AND id = ${input.environmentId}
    LIMIT 1
  `;
  const environment = rows[0];
  if (!environment) {
    throw new ProjectEnvironmentCoordinateError("environment not found");
  }
  if (environment.project_id !== input.projectId) {
    throw new ProjectEnvironmentCoordinateError("environment does not belong to project");
  }
  if (environment.is_protected) {
    throw new ProjectEnvironmentCoordinateError("environment is protected");
  }
  return { isProtected: false };
}
