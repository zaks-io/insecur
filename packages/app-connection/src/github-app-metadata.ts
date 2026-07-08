import type { OpaqueResourceId } from "@insecur/domain";

/** Org-scoped sensitive metadata type for GitHub App installation boundaries. */
export const GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE = "app_connection.github_boundary" as const;

/** Org-scoped sensitive metadata type for verified provider account linkage. */
export const GITHUB_CONNECTION_LINKAGE_METADATA_TYPE = "app_connection.github_linkage" as const;

export const GITHUB_BOUNDARY_FIELD_KEYS = {
  installationId: "installation_id",
  owner: "owner",
  allowedRepositories: "allowed_repositories",
} as const;

export const GITHUB_LINKAGE_FIELD_KEYS = {
  providerAccountId: "provider_account_id",
  providerAppRegistrationId: "provider_app_registration_id",
} as const;

export interface GitHubConnectionBoundary {
  readonly installationId: string;
  readonly owner: string;
  readonly allowedRepositories: readonly string[];
}

export interface GitHubConnectionLinkage {
  readonly providerAccountId: string;
  readonly providerAppRegistrationId: string;
}

/** Stable dotted codes for audit detail maps (ADR-0068 value-type guard). */
export const GITHUB_INSTALLATION_STATUS_AUDIT_CODES = {
  active: "connection.installation_status.active",
  suspended: "connection.installation_status.suspended",
} as const satisfies Record<"active" | "suspended", string>;

export function toGithubInstallationStatusAuditCode(
  installationStatus: "active" | "suspended",
): (typeof GITHUB_INSTALLATION_STATUS_AUDIT_CODES)[keyof typeof GITHUB_INSTALLATION_STATUS_AUDIT_CODES] {
  return GITHUB_INSTALLATION_STATUS_AUDIT_CODES[installationStatus];
}

export function githubConnectionRecordResourceId(appConnectionId: string): OpaqueResourceId {
  return appConnectionId as OpaqueResourceId;
}

const REPOSITORY_FULL_NAME_PATTERN = /^[^/\s]+\/[^/\s]+$/;

export function isExactRepositoryFullName(repositoryFullName: string): boolean {
  return (
    !repositoryFullName.includes("*") &&
    !repositoryFullName.includes("?") &&
    REPOSITORY_FULL_NAME_PATTERN.test(repositoryFullName)
  );
}

export function serializeAllowedRepositories(repositories: readonly string[]): string {
  return JSON.stringify([...repositories]);
}

export function parseAllowedRepositories(serialized: string): readonly string[] {
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("invalid allowed repository payload");
  }
  return parsed as readonly string[];
}
