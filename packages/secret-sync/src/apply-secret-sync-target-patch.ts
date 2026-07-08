import { SECRET_SYNC_KINDS, type OrganizationId, type ProjectId } from "@insecur/domain";
import {
  TenantSensitiveMetadataStore,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import type { Keyring } from "@insecur/crypto";
import { storeSecretSyncWorkerScriptTarget } from "./store-secret-sync-sensitive-metadata.js";
import {
  validateCloudflareWorkerSecretTarget,
  validateGitHubActionsTarget,
  type GitHubActionsTargetInput,
} from "./validate-secret-sync-target.js";

export async function applySecretSyncTargetPatch(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly existing: SecretSyncRow;
  readonly githubTarget?: GitHubActionsTargetInput;
  readonly cloudflareTarget?: { readonly workerScriptName: string };
  readonly keyring: Keyring;
}): Promise<{
  readonly githubProviderScope?: SecretSyncRow["githubProviderScope"];
  readonly targetRepoId?: string | null;
  readonly targetGithubEnvironmentId?: string | null;
}> {
  const sensitiveMetadataStore = new TenantSensitiveMetadataStore(input.db);
  let targetPatch: {
    githubProviderScope?: SecretSyncRow["githubProviderScope"];
    targetRepoId?: string | null;
    targetGithubEnvironmentId?: string | null;
  } = {};

  if (input.existing.kind === SECRET_SYNC_KINDS.githubActions && input.githubTarget !== undefined) {
    const validatedTarget = validateGitHubActionsTarget(input.githubTarget);
    targetPatch = {
      githubProviderScope: validatedTarget.githubProviderScope,
      targetRepoId: validatedTarget.targetRepoId,
      targetGithubEnvironmentId: validatedTarget.targetGithubEnvironmentId,
    };
  }

  if (
    input.existing.kind === SECRET_SYNC_KINDS.cloudflareWorkerSecret &&
    input.cloudflareTarget !== undefined
  ) {
    const validatedTarget = validateCloudflareWorkerSecretTarget(input.cloudflareTarget);
    if (validatedTarget.workerScriptName !== null) {
      await storeSecretSyncWorkerScriptTarget({
        organizationId: input.organizationId,
        projectId: input.projectId,
        secretSyncId: input.existing.id,
        workerScriptName: validatedTarget.workerScriptName,
        keyring: input.keyring,
        sensitiveMetadataStore,
      });
    }
  }

  return targetPatch;
}
