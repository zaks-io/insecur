import type { SecretId, SecretSyncBindingId } from "@insecur/domain";
import type { SecretSyncRow } from "@insecur/tenant-store";

export interface MetadataSafeSecretSyncBinding {
  readonly id: SecretSyncBindingId;
  readonly secretId: SecretId;
  readonly hasProviderDestination: boolean;
}

export type MetadataSafeSecretSync = Pick<
  SecretSyncRow,
  | "id"
  | "organizationId"
  | "projectId"
  | "environmentId"
  | "appConnectionId"
  | "displayName"
  | "kind"
  | "mappingBehavior"
  | "autoSyncEnabled"
  | "status"
  | "githubProviderScope"
  | "targetRepoId"
  | "targetGithubEnvironmentId"
> & {
  readonly hasWorkerScriptTarget: boolean;
  readonly bindings: readonly MetadataSafeSecretSyncBinding[];
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function toMetadataSafeSecretSync(input: {
  readonly sync: SecretSyncRow;
  readonly bindings: readonly {
    readonly id: SecretSyncBindingId;
    readonly secretId: SecretId;
    readonly hasProviderDestination: boolean;
  }[];
  readonly hasWorkerScriptTarget: boolean;
}): MetadataSafeSecretSync {
  return {
    id: input.sync.id,
    organizationId: input.sync.organizationId,
    projectId: input.sync.projectId,
    environmentId: input.sync.environmentId,
    appConnectionId: input.sync.appConnectionId,
    displayName: input.sync.displayName,
    kind: input.sync.kind,
    mappingBehavior: input.sync.mappingBehavior,
    autoSyncEnabled: input.sync.autoSyncEnabled,
    status: input.sync.status,
    githubProviderScope: input.sync.githubProviderScope,
    targetRepoId: input.sync.targetRepoId,
    targetGithubEnvironmentId: input.sync.targetGithubEnvironmentId,
    hasWorkerScriptTarget: input.hasWorkerScriptTarget,
    bindings: input.bindings.map((binding) => ({
      id: binding.id,
      secretId: binding.secretId,
      hasProviderDestination: binding.hasProviderDestination,
    })),
    disabledAt: input.sync.disabledAt?.toISOString() ?? null,
    createdAt: input.sync.createdAt.toISOString(),
    updatedAt: input.sync.updatedAt.toISOString(),
  };
}
