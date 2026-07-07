import { organizationId, projectId, type OrganizationId, type ProjectId } from "@insecur/domain";
import type { DisplayName } from "@insecur/domain";
import { and, asc, eq } from "drizzle-orm";

import { projects } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { ProjectMetadataRow } from "./types.js";

/**
 * Tenant-qualified project metadata reads. Callers must enforce Effective Access before returning
 * rows to untrusted surfaces.
 */
export class TenantProjectMetadataStore {
  constructor(private readonly db: TenantScopedDb) {}

  async listByOrganization(
    organizationIdValue: OrganizationId,
  ): Promise<readonly ProjectMetadataRow[]> {
    const rows = await this.db
      .select({
        id: projects.id,
        orgId: projects.orgId,
        displayName: projects.displayName,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(eq(projects.orgId, organizationIdValue))
      .orderBy(asc(projects.displayName), asc(projects.id));

    return rows.map((row) => ({
      projectId: projectId.brand(row.id),
      organizationId: organizationId.brand(row.orgId),
      displayName: row.displayName as ProjectMetadataRow["displayName"],
      createdAt: row.createdAt,
    }));
  }

  async create(input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    displayName: DisplayName;
  }): Promise<ProjectMetadataRow> {
    await this.db.insert(projects).values({
      id: input.projectId,
      orgId: input.organizationId,
      displayName: input.displayName,
    });

    const rows = await this.db
      .select({
        id: projects.id,
        orgId: projects.orgId,
        displayName: projects.displayName,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(eq(projects.orgId, input.organizationId), eq(projects.id, input.projectId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new Error("project row missing after insert");
    }
    return {
      projectId: projectId.brand(row.id),
      organizationId: organizationId.brand(row.orgId),
      displayName: row.displayName as ProjectMetadataRow["displayName"],
      createdAt: row.createdAt,
    };
  }
}
