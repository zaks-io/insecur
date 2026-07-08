import type { GitHubAppInstallationVerifyResult } from "./github-app-port.js";
import type { MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";

export function toMetadataSafeGitHubValidation(
  checkedAt: Date,
  outcome: "success" | "failed",
  reasonCode: string | null,
  validation?: GitHubAppInstallationVerifyResult,
): MetadataSafeGitHubConnectionValidation {
  return {
    checkedAt: checkedAt.toISOString(),
    outcome,
    reasonCode,
    installationStatus: validation?.installationStatus ?? null,
    accessibleRepositoryCount: validation?.accessibleRepositoryCount ?? null,
    repositoriesWithinBoundary: validation?.repositoriesWithinBoundary ?? null,
  };
}
