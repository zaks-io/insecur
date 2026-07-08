import type { OrganizationId, ProjectId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";
import { INIT_REMEDIATION } from "../output/cli-remediation.js";

export interface ResolvedOrgScope {
  readonly orgId: OrganizationId;
}

export interface ResolvedProjectScope extends ResolvedOrgScope {
  readonly projectId: ProjectId;
}

export function requireOrgScope(scope: ResolvedCliScope): ResolvedOrgScope {
  if (scope.orgId === undefined) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message:
          "Missing organization scope. Run insecur init or pass --org-id (or set INSECUR_ORG).",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return { orgId: scope.orgId };
}

export function requireProjectScope(scope: ResolvedCliScope): ResolvedProjectScope {
  const orgScope = requireOrgScope(scope);
  if (scope.projectId === undefined) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message:
          "Missing project scope. Run insecur init or pass --project-id (or set INSECUR_PROJECT).",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return { orgId: orgScope.orgId, projectId: scope.projectId };
}
