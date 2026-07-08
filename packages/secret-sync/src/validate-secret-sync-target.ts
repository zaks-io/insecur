import {
  GITHUB_ACTIONS_PROVIDER_SCOPES,
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
  isSecretSyncKind,
  type GitHubActionsProviderScope,
  type SecretSyncKind,
} from "@insecur/domain";

import { SecretSyncError } from "./secret-sync-error.js";

export interface GitHubActionsTargetInput {
  readonly targetRepoId: string;
  readonly githubProviderScope: GitHubActionsProviderScope;
  readonly targetGithubEnvironmentId?: string | null;
}

export interface CloudflareWorkerSecretTargetInput {
  readonly workerScriptName: string;
}

export interface ValidatedSecretSyncTarget {
  readonly kind: SecretSyncKind;
  readonly targetRepoId: string | null;
  readonly githubProviderScope: GitHubActionsProviderScope | null;
  readonly targetGithubEnvironmentId: string | null;
  readonly workerScriptName: string | null;
}

function parseOpaqueTargetId(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      `secret sync ${label} must be an exact opaque target id`,
    );
  }
  if (trimmed.includes("*") || trimmed.includes("?")) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      `secret sync ${label} must not use pattern selectors`,
    );
  }
  return trimmed;
}

function parseWorkerScriptName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "cloudflare worker secret sync requires an exact worker script name",
    );
  }
  if (trimmed.includes("*") || trimmed.includes("?")) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "cloudflare worker script target must be exact",
    );
  }
  return trimmed;
}

export function validateGitHubActionsTarget(
  input: GitHubActionsTargetInput,
): ValidatedSecretSyncTarget {
  const targetRepoId = parseOpaqueTargetId(input.targetRepoId, "target repo id");
  if (
    input.githubProviderScope === GITHUB_ACTIONS_PROVIDER_SCOPES.environment &&
    (input.targetGithubEnvironmentId === undefined ||
      input.targetGithubEnvironmentId === null ||
      input.targetGithubEnvironmentId.trim().length === 0)
  ) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "github environment-scoped sync requires an exact github environment id",
    );
  }

  return {
    kind: SECRET_SYNC_KINDS.githubActions,
    targetRepoId,
    githubProviderScope: input.githubProviderScope,
    targetGithubEnvironmentId:
      input.githubProviderScope === GITHUB_ACTIONS_PROVIDER_SCOPES.environment
        ? parseOpaqueTargetId(input.targetGithubEnvironmentId ?? "", "github environment id")
        : null,
    workerScriptName: null,
  };
}

export function validateCloudflareWorkerSecretTarget(
  input: CloudflareWorkerSecretTargetInput,
): ValidatedSecretSyncTarget {
  return {
    kind: SECRET_SYNC_KINDS.cloudflareWorkerSecret,
    targetRepoId: null,
    githubProviderScope: null,
    targetGithubEnvironmentId: null,
    workerScriptName: parseWorkerScriptName(input.workerScriptName),
  };
}

export function validateSecretSyncKind(raw: string): SecretSyncKind {
  if (!isSecretSyncKind(raw)) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "secret sync kind is not supported",
    );
  }
  return raw;
}
