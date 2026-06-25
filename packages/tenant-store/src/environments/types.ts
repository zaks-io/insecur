import type {
  DisplayName,
  EnvironmentId,
  EnvironmentLifecycleStage,
  OrganizationId,
  ProjectId,
  UserId,
} from "@insecur/domain";

/** Metadata-safe preview opt-down evidence (no Sensitive Values). */
export interface PreviewNonProductionOptDown {
  confirmedAt: Date;
  confirmedByUserId: UserId;
}

export interface CreateEnvironmentLifecycleInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  displayName: DisplayName;
  lifecycleStage: EnvironmentLifecycleStage;
  previewNonProductionOptDown?: PreviewNonProductionOptDown;
}

export interface UpdateEnvironmentLifecycleMetadataInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  displayName: DisplayName;
}

export interface EnvironmentLifecycleRow {
  environmentId: EnvironmentId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  displayName: DisplayName;
  lifecycleStage: EnvironmentLifecycleStage;
  isProtected: boolean;
  previewNonProductionOptDown: PreviewNonProductionOptDown | null;
  createdAt: Date;
}
