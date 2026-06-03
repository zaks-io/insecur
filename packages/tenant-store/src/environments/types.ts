import type {
  DisplayName,
  EnvironmentId,
  EnvironmentLifecycleState,
  EnvironmentPostureTier,
  OrganizationId,
  ProjectId,
  UserId,
} from "@insecur/domain";

export interface EnvironmentLifecycleRow {
  id: string;
  org_id: string;
  project_id: string;
  display_name: string;
  is_protected: boolean;
  posture_tier: string;
  lifecycle_state: string;
  preview_non_protected_opt_down_at: Date | null;
  preview_non_protected_opt_down_actor_user_id: string | null;
  preview_automation_opt_in_at: Date | null;
  preview_automation_opt_in_actor_user_id: string | null;
  lifecycle_updated_at: Date;
  created_at: Date;
}

export interface EnvironmentLifecycleMetadata {
  environmentId: EnvironmentId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  displayName: DisplayName;
  isProtected: boolean;
  postureTier: EnvironmentPostureTier;
  lifecycleState: EnvironmentLifecycleState;
  previewNonProtectedOptDown:
    | {
        optedDownAt: Date;
        actorUserId: UserId;
      }
    | undefined;
  previewAutomationOptIn:
    | {
        optedInAt: Date;
        actorUserId: UserId;
      }
    | undefined;
  lifecycleUpdatedAt: Date;
  createdAt: Date;
}

export interface InsertEnvironmentLifecycleInput {
  environmentId: EnvironmentId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  displayName: DisplayName;
  postureTier: EnvironmentPostureTier;
  isProtected: boolean;
  previewNonProtectedOptDownAt?: Date;
  previewNonProtectedOptDownActorUserId?: UserId;
}

export interface UpdateEnvironmentLifecyclePatch {
  lifecycleState?: EnvironmentLifecycleState;
  previewAutomationOptIn?: boolean;
  lifecycleUpdatedAt: Date;
  previewAutomationOptInActorUserId?: UserId;
}
