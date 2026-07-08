import { secretSyncs } from "../db/schema/tenant-secret-syncs.js";
import type { UpdateSecretSyncInput } from "./types.js";

const UPDATE_FIELD_MAPPINGS: readonly {
  readonly inputKey: keyof UpdateSecretSyncInput;
  readonly patchKey: keyof typeof secretSyncs.$inferInsert;
}[] = [
  { inputKey: "displayName", patchKey: "displayName" },
  { inputKey: "mappingBehavior", patchKey: "mappingBehavior" },
  { inputKey: "autoSyncEnabled", patchKey: "autoSyncEnabled" },
  { inputKey: "githubProviderScope", patchKey: "githubProviderScope" },
  { inputKey: "targetRepoId", patchKey: "targetRepoId" },
  { inputKey: "targetGithubEnvironmentId", patchKey: "targetGithubEnvironmentId" },
  { inputKey: "status", patchKey: "status" },
  { inputKey: "disabledAt", patchKey: "disabledAt" },
  { inputKey: "deletedAt", patchKey: "deletedAt" },
];

export function buildSecretSyncUpdatePatch(
  input: UpdateSecretSyncInput,
): Partial<typeof secretSyncs.$inferInsert> {
  const patch: Partial<typeof secretSyncs.$inferInsert> = {
    updatedAt: new Date(),
  };

  for (const mapping of UPDATE_FIELD_MAPPINGS) {
    const value = input[mapping.inputKey];
    if (value !== undefined) {
      patch[mapping.patchKey] = value as never;
    }
  }

  return patch;
}
