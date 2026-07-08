import type { OrganizationId, ProjectId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { organizations, projects } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

/** Read-only hierarchy display-name lookups for metadata-safe notification envelopes. */
export class TenantHierarchyDisplayNameStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getOrganizationDisplayName(organizationIdValue: OrganizationId): Promise<string | null> {
    const rows = await this.db
      .select({ displayName: organizations.displayName })
      .from(organizations)
      .where(eq(organizations.id, organizationIdValue))
      .limit(1);
    return rows[0]?.displayName ?? null;
  }

  async getProjectDisplayName(
    organizationIdValue: OrganizationId,
    projectIdValue: ProjectId,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ displayName: projects.displayName })
      .from(projects)
      .where(and(eq(projects.orgId, organizationIdValue), eq(projects.id, projectIdValue)))
      .limit(1);
    return rows[0]?.displayName ?? null;
  }
}
