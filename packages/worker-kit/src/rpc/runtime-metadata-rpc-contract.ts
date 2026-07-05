import type {
  DisplayName,
  EnvironmentId,
  EnvironmentLifecycleStage,
  OrganizationId,
  ProjectId,
} from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

/** Metadata-only project row for list reads (no slugs). */
export interface ProjectMetadataRead {
  readonly projectId: ProjectId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly createdAt: string;
}

export interface ListProjectsRpcPayload {
  readonly projects: readonly ProjectMetadataRead[];
}

export interface ListProjectsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}

/** Metadata-only environment row for list reads (includes protection flag). */
export interface EnvironmentMetadataRead {
  readonly environmentId: EnvironmentId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly displayName: DisplayName;
  readonly lifecycleStage: EnvironmentLifecycleStage;
  readonly isProtected: boolean;
  readonly createdAt: string;
}

export interface ListEnvironmentsRpcPayload {
  readonly environments: readonly EnvironmentMetadataRead[];
}

export interface ListEnvironmentsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}
