import type { CreateSecretSyncInput } from "./types.js";
import { secretSyncs } from "../db/schema/tenant-secret-syncs.js";

export function buildCreateSecretSyncInsert(
  input: CreateSecretSyncInput,
): typeof secretSyncs.$inferInsert {
  return {
    id: input.secretSyncId,
    orgId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    appConnectionId: input.appConnectionId,
    displayName: input.displayName,
    kind: input.kind,
    mappingBehavior: input.mappingBehavior ?? "managed",
    autoSyncEnabled: input.autoSyncEnabled ?? false,
    status: "active",
    githubProviderScope: input.githubProviderScope ?? null,
    targetRepoId: input.targetRepoId ?? null,
    targetGithubEnvironmentId: input.targetGithubEnvironmentId ?? null,
    createdByUserId: input.createdByUserId,
  };
}
