import { describe, expect, it } from "vitest";

import { toMetadataSafeSecretSync } from "../src/metadata-safe-secret-sync.js";

describe("toMetadataSafeSecretSync", () => {
  it("returns metadata-safe sync views without provider destination plaintext", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = toMetadataSafeSecretSync({
      sync: {
        id: "sync_00000000000000000000000001",
        organizationId: "org_00000000000000000000000001",
        projectId: "prj_00000000000000000000000001",
        environmentId: "env_00000000000000000000000001",
        appConnectionId: "conn_00000000000000000000000001",
        displayName: "prod sync",
        kind: "github_actions",
        mappingBehavior: "managed",
        autoSyncEnabled: true,
        status: "active",
        githubProviderScope: "repository",
        targetRepoId: "repo_00000000000000000000000001",
        targetGithubEnvironmentId: null,
        createdByUserId: "usr_00000000000000000000000001",
        disabledAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      bindings: [
        {
          id: "sbind_00000000000000000000000001",
          secretId: "sec_00000000000000000000000001",
          hasProviderDestination: true,
        },
      ],
      hasWorkerScriptTarget: false,
    });

    expect(result.bindings[0]?.hasProviderDestination).toBe(true);
    expect(result.disabledAt).toBeNull();
    expect(result.createdAt).toBe(now.toISOString());
  });
});
