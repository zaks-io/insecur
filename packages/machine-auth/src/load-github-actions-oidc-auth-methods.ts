import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import type { OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { GitHubActionsOidcAuthMethodRow } from "./github-actions-oidc-auth-method-row.js";
import { parseCredentialScopeRows } from "./parse-credential-scope-rows.js";

interface GithubActionsOidcAuthMethodDbRow {
  id: string;
  org_id: string;
  machine_identity_id: string;
  project_id: string;
  environment_id: string | null;
  github_repository: string;
  github_repository_id: string;
  github_repository_owner_id: string;
  github_environment: string | null;
  oidc_audience: string;
  credential_scopes: string[];
  status: string;
}

function toAuthMethodRow(
  row: GithubActionsOidcAuthMethodDbRow,
): GitHubActionsOidcAuthMethodRow | null {
  const credentialScopes = parseCredentialScopeRows(row.credential_scopes);
  if (credentialScopes === null) {
    return null;
  }
  if (row.status !== "active") {
    return null;
  }

  return {
    id: machineAuthMethodId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    machineIdentityId: machineIdentityId.brand(row.machine_identity_id),
    projectId: projectId.brand(row.project_id),
    environmentId: row.environment_id === null ? null : environmentId.brand(row.environment_id),
    githubRepository: row.github_repository,
    githubRepositoryId: row.github_repository_id,
    githubRepositoryOwnerId: row.github_repository_owner_id,
    githubEnvironment: row.github_environment,
    oidcAudience: row.oidc_audience,
    credentialScopes,
    status: "active",
  };
}

/**
 * Loads active GitHub Actions OIDC auth methods for an Organization inside tenant scope.
 */
export async function loadActiveGitHubActionsOidcAuthMethods(
  sql: TenantScopedSql,
  orgId: OrganizationId,
): Promise<readonly GitHubActionsOidcAuthMethodRow[]> {
  const rows = await sql<GithubActionsOidcAuthMethodDbRow[]>`
    SELECT
      method.id,
      method.org_id,
      method.machine_identity_id,
      method.project_id,
      method.environment_id,
      method.github_repository,
      method.github_repository_id,
      method.github_repository_owner_id,
      method.github_environment,
      method.oidc_audience,
      method.credential_scopes,
      method.status
    FROM machine_identity_github_actions_oidc AS method
    INNER JOIN machine_identities AS identity
      ON identity.org_id = method.org_id
      AND identity.id = method.machine_identity_id
    WHERE method.org_id = ${orgId}
      AND method.status = 'active'
      AND identity.status = 'active'
  `;

  const authMethods: GitHubActionsOidcAuthMethodRow[] = [];
  for (const row of rows) {
    const parsed = toAuthMethodRow(row);
    if (parsed !== null) {
      authMethods.push(parsed);
    }
  }
  return authMethods;
}
