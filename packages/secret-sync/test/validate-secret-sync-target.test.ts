import {
  GITHUB_ACTIONS_PROVIDER_SCOPES,
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  validateCloudflareWorkerSecretTarget,
  validateGitHubActionsTarget,
  validateSecretSyncKind,
} from "../src/validate-secret-sync-target.js";

describe("validateSecretSyncKind", () => {
  it("accepts supported secret sync kinds", () => {
    expect(validateSecretSyncKind(SECRET_SYNC_KINDS.githubActions)).toBe(
      SECRET_SYNC_KINDS.githubActions,
    );
  });

  it("rejects unsupported kinds", () => {
    expect(() => validateSecretSyncKind("vercel")).toThrow(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidDestination }),
    );
  });
});

describe("validateGitHubActionsTarget", () => {
  it("accepts repository-scoped github targets", () => {
    const result = validateGitHubActionsTarget({
      targetRepoId: "repo_00000000000000000000000001",
      githubProviderScope: GITHUB_ACTIONS_PROVIDER_SCOPES.repository,
    });
    expect(result.targetRepoId).toBe("repo_00000000000000000000000001");
    expect(result.targetGithubEnvironmentId).toBeNull();
  });

  it("requires an environment id for environment-scoped targets", () => {
    expect(() =>
      validateGitHubActionsTarget({
        targetRepoId: "repo_00000000000000000000000001",
        githubProviderScope: GITHUB_ACTIONS_PROVIDER_SCOPES.environment,
      }),
    ).toThrow(expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidDestination }));
  });
});

describe("validateCloudflareWorkerSecretTarget", () => {
  it("accepts exact worker script names", () => {
    const result = validateCloudflareWorkerSecretTarget({ workerScriptName: "insecur-api" });
    expect(result.workerScriptName).toBe("insecur-api");
  });

  it("rejects wildcard worker script names", () => {
    expect(() => validateCloudflareWorkerSecretTarget({ workerScriptName: "insecur-*" })).toThrow(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidDestination }),
    );
  });
});
