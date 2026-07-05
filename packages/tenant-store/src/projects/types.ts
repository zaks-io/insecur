import type { DisplayName, OrganizationId, ProjectId } from "@insecur/domain";

export interface ProjectMetadataRow {
  projectId: ProjectId;
  organizationId: OrganizationId;
  displayName: DisplayName;
  createdAt: Date;
}
