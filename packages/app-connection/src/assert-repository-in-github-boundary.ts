import { APP_CONNECTION_ERROR_CODES } from "@insecur/domain";

import { AppConnectionError } from "./app-connection-error.js";
import { isExactRepositoryFullName, type GitHubConnectionBoundary } from "./github-app-metadata.js";

export function assertRepositoryInGitHubConnectionBoundary(
  boundary: GitHubConnectionBoundary,
  repositoryFullName: string,
): void {
  if (!isExactRepositoryFullName(repositoryFullName)) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "repository boundary must use exact owner/repo names",
    );
  }

  if (!boundary.allowedRepositories.includes(repositoryFullName)) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "repository is outside the configured app connection boundary",
    );
  }
}

export function assertGitHubAllowedRepositoriesBoundary(boundary: GitHubConnectionBoundary): void {
  if (boundary.allowedRepositories.length === 0) {
    throw new AppConnectionError(
      APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      "at least one explicit repository is required",
    );
  }

  for (const repositoryFullName of boundary.allowedRepositories) {
    if (!isExactRepositoryFullName(repositoryFullName)) {
      throw new AppConnectionError(
        APP_CONNECTION_ERROR_CODES.boundaryMismatch,
        "repository boundary must use exact owner/repo names",
      );
    }
  }
}
