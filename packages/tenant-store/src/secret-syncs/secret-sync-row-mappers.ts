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

import { secretSyncBindings, secretSyncs } from "../db/schema/tenant-secret-syncs.js";
import type { SecretSyncBindingRow, SecretSyncRow, SecretSyncStatus } from "./types.js";

export const secretSyncSelect = {
  id: secretSyncs.id,
  org_id: secretSyncs.orgId,
  project_id: secretSyncs.projectId,
  environment_id: secretSyncs.environmentId,
  app_connection_id: secretSyncs.appConnectionId,
  display_name: secretSyncs.displayName,
  kind: secretSyncs.kind,
  mapping_behavior: secretSyncs.mappingBehavior,
  auto_sync_enabled: secretSyncs.autoSyncEnabled,
  status: secretSyncs.status,
  github_provider_scope: secretSyncs.githubProviderScope,
  target_repo_id: secretSyncs.targetRepoId,
  target_github_environment_id: secretSyncs.targetGithubEnvironmentId,
  created_by_user_id: secretSyncs.createdByUserId,
  disabled_at: secretSyncs.disabledAt,
  deleted_at: secretSyncs.deletedAt,
  created_at: secretSyncs.createdAt,
  updated_at: secretSyncs.updatedAt,
} as const;

export const secretSyncBindingSelect = {
  id: secretSyncBindings.id,
  org_id: secretSyncBindings.orgId,
  secret_sync_id: secretSyncBindings.secretSyncId,
  secret_id: secretSyncBindings.secretId,
  created_at: secretSyncBindings.createdAt,
  updated_at: secretSyncBindings.updatedAt,
} as const;

export function toSecretSyncRow(row: {
  id: string;
  org_id: string;
  project_id: string;
  environment_id: string;
  app_connection_id: string;
  display_name: string;
  kind: string;
  mapping_behavior: string;
  auto_sync_enabled: boolean;
  status: string;
  github_provider_scope: string | null;
  target_repo_id: string | null;
  target_github_environment_id: string | null;
  created_by_user_id: string;
  disabled_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): SecretSyncRow {
  return {
    id: row.id as SecretSyncId,
    organizationId: row.org_id as OrganizationId,
    projectId: row.project_id as ProjectId,
    environmentId: row.environment_id as EnvironmentId,
    appConnectionId: row.app_connection_id as AppConnectionId,
    displayName: row.display_name as DisplayName,
    kind: row.kind as SecretSyncKind,
    mappingBehavior: row.mapping_behavior as SecretSyncMappingBehavior,
    autoSyncEnabled: row.auto_sync_enabled,
    status: row.status as SecretSyncStatus,
    githubProviderScope: row.github_provider_scope as GitHubActionsProviderScope | null,
    targetRepoId: row.target_repo_id,
    targetGithubEnvironmentId: row.target_github_environment_id,
    createdByUserId: row.created_by_user_id as UserId,
    disabledAt: row.disabled_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSecretSyncBindingRow(row: {
  id: string;
  org_id: string;
  secret_sync_id: string;
  secret_id: string;
  created_at: Date;
  updated_at: Date;
}): SecretSyncBindingRow {
  return {
    id: row.id as SecretSyncBindingId,
    organizationId: row.org_id as OrganizationId,
    secretSyncId: row.secret_sync_id as SecretSyncId,
    secretId: row.secret_id as SecretId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
