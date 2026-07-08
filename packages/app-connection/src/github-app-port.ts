import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";

import { AppConnectionError } from "./app-connection-error.js";
import {
  assertGitHubAllowedRepositoriesBoundary,
  assertRepositoryInGitHubConnectionBoundary,
} from "./assert-repository-in-github-boundary.js";
import type { GitHubConnectionBoundary } from "./github-app-metadata.js";

export interface GitHubAppInstallationVerifyInput extends GitHubConnectionBoundary {
  readonly providerAppRegistrationId: string;
}

export interface GitHubAppInstallationVerifyResult {
  readonly installationStatus: "active" | "suspended";
  readonly accessibleRepositoryCount: number;
  readonly repositoriesWithinBoundary: boolean;
}

export interface GitHubAppInstallationPort {
  verifyInstallation(
    input: GitHubAppInstallationVerifyInput,
  ): Promise<GitHubAppInstallationVerifyResult>;
}

export function createGitHubAppInstallationPort(): GitHubAppInstallationPort {
  return {
    verifyInstallation(
      input: GitHubAppInstallationVerifyInput,
    ): Promise<GitHubAppInstallationVerifyResult> {
      assertGitHubAllowedRepositoriesBoundary(input);

      if (input.installationId.trim() === "" || input.owner.trim() === "") {
        throw new AppConnectionError(
          APP_CONNECTION_ERROR_CODES.validationFailed,
          "github installation metadata is incomplete",
        );
      }

      if (input.providerAppRegistrationId.trim() === "") {
        throw new AppConnectionError(
          APP_CONNECTION_ERROR_CODES.providerRegistrationMissing,
          "provider app registration reference is required",
        );
      }

      for (const repositoryFullName of input.allowedRepositories) {
        assertRepositoryInGitHubConnectionBoundary(input, repositoryFullName);
      }

      return Promise.resolve({
        installationStatus: "active",
        accessibleRepositoryCount: input.allowedRepositories.length,
        repositoriesWithinBoundary: true,
      });
    },
  };
}

export { assertRepositoryInGitHubConnectionBoundary };
