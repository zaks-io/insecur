import { organizationId, projectId, type OrganizationId } from "@insecur/domain";
import { asc, eq } from "drizzle-orm";

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
}
