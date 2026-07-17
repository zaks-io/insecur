import type {
  AppConnectionId,
  DisplayName,
  EnvironmentId,
  GitHubActionsProviderScope,
  OrganizationId,
  ProjectId,
  RequestId,
  SecretId,
  SecretSyncBindingId,
  SecretSyncId,
  SecretSyncKind,
  SecretSyncMappingBehavior,
} from "@insecur/domain";
import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

/** Exact-binding input; pattern selectors are rejected inside the Runtime command (INS-77). */
export interface SecretSyncBindingRpcInput {
  readonly secretId: string;
  readonly providerDestination: string;
}

export interface SecretSyncGitHubTargetRpcInput {
  readonly targetRepoId: string;
  readonly githubProviderScope: GitHubActionsProviderScope;
  readonly targetGithubEnvironmentId?: string;
}

export interface SecretSyncCloudflareTargetRpcInput {
  readonly workerScriptName: string;
}

export interface CreateSecretSyncRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly displayName: DisplayName;
  readonly kind: string;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly bindings: readonly SecretSyncBindingRpcInput[];
  readonly githubTarget?: SecretSyncGitHubTargetRpcInput;
  readonly cloudflareTarget?: SecretSyncCloudflareTargetRpcInput;
  readonly requestId: RequestId;
  /**
   * Approved Protected Change authorizing this enable when the environment is protected (INS-87 /
   * INS-608). A reference only — the delivery-target fingerprint is never accepted from callers;
   * enforcement reads it from the server-recorded approval evidence.
   */
  readonly protectedChangeId?: RequestId;
}

export interface UpdateSecretSyncRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly displayName?: DisplayName;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly bindings?: readonly SecretSyncBindingRpcInput[];
  readonly githubTarget?: SecretSyncGitHubTargetRpcInput;
  readonly cloudflareTarget?: SecretSyncCloudflareTargetRpcInput;
  readonly requestId: RequestId;
  /** See {@link CreateSecretSyncRpcInput.protectedChangeId}. */
  readonly protectedChangeId?: RequestId;
}

export interface SecretSyncBindingRpcPayload {
  readonly id: SecretSyncBindingId;
  readonly secretId: SecretId;
  readonly hasProviderDestination: boolean;
}

/** Metadata-only Secret Sync envelope (ADR-0070): ids, display name, flags — never provider destinations or Sensitive Values. */
export interface SecretSyncRpcPayload {
  readonly id: SecretSyncId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly displayName: DisplayName;
  readonly kind: SecretSyncKind;
  readonly mappingBehavior: SecretSyncMappingBehavior;
  readonly autoSyncEnabled: boolean;
  readonly status: string;
  readonly githubProviderScope: string | null;
  readonly targetRepoId: string | null;
  readonly targetGithubEnvironmentId: string | null;
  readonly hasWorkerScriptTarget: boolean;
  readonly bindings: readonly SecretSyncBindingRpcPayload[];
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SecretSyncMutationRpcPayload {
  readonly secretSync: SecretSyncRpcPayload;
  readonly auditEventId: string;
}
