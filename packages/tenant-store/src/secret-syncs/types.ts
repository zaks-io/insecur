import type {
  AppConnectionId,
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretSyncBindingId,
  SecretSyncId,
  UserId,
} from "@insecur/domain";
import type { SecretSyncKind, SecretSyncMappingBehavior } from "@insecur/domain";
import type { GitHubActionsProviderScope } from "@insecur/domain";

export const SECRET_SYNC_STATUSES = ["active", "disabled", "deleted"] as const;

export type SecretSyncStatus = (typeof SECRET_SYNC_STATUSES)[number];

export interface SecretSyncRow {
  readonly id: SecretSyncId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly displayName: DisplayName;
  readonly kind: SecretSyncKind;
  readonly mappingBehavior: SecretSyncMappingBehavior;
  readonly autoSyncEnabled: boolean;
  readonly status: SecretSyncStatus;
  readonly githubProviderScope: GitHubActionsProviderScope | null;
  readonly targetRepoId: string | null;
  readonly targetGithubEnvironmentId: string | null;
  readonly createdByUserId: UserId;
  readonly disabledAt: Date | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SecretSyncBindingRow {
  readonly id: SecretSyncBindingId;
  readonly organizationId: OrganizationId;
  readonly secretSyncId: SecretSyncId;
  readonly secretId: SecretId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateSecretSyncInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly secretSyncId: SecretSyncId;
  readonly displayName: DisplayName;
  readonly kind: SecretSyncKind;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly githubProviderScope?: GitHubActionsProviderScope | null;
  readonly targetRepoId?: string | null;
  readonly targetGithubEnvironmentId?: string | null;
  readonly createdByUserId: UserId;
}

export interface UpdateSecretSyncInput {
  readonly organizationId: OrganizationId;
  readonly secretSyncId: SecretSyncId;
  readonly displayName?: DisplayName;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly githubProviderScope?: GitHubActionsProviderScope | null;
  readonly targetRepoId?: string | null;
  readonly targetGithubEnvironmentId?: string | null;
  readonly status?: SecretSyncStatus;
  readonly disabledAt?: Date | null;
  readonly deletedAt?: Date | null;
}

export interface CreateSecretSyncBindingInput {
  readonly organizationId: OrganizationId;
  readonly secretSyncId: SecretSyncId;
  readonly bindingId: SecretSyncBindingId;
  readonly secretId: SecretId;
}

export interface ListSecretSyncsInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

export interface ReplaceSecretSyncBindingsInput {
  readonly organizationId: OrganizationId;
  readonly secretSyncId: SecretSyncId;
  readonly bindings: readonly CreateSecretSyncBindingInput[];
}
