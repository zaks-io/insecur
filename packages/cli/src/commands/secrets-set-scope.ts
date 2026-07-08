import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";
import { INIT_REMEDIATION } from "../output/cli-remediation.js";

export interface ResolvedSecretWriteScope {
  readonly orgId: OrganizationId;
  readonly projectId: ProjectId;
  readonly envId: EnvironmentId;
}

export function requireSecretWriteScope(scope: ResolvedCliScope): ResolvedSecretWriteScope {
  if (scope.orgId === undefined || scope.projectId === undefined || scope.envId === undefined) {
    const missing: string[] = [];
    if (scope.orgId === undefined) {
      missing.push("organization");
    }
    if (scope.projectId === undefined) {
      missing.push("project");
    }
    if (scope.envId === undefined) {
      missing.push("environment");
    }
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message: `Missing ${missing.join(", ")} scope. Run insecur init or pass --org-id, --project-id, and --env-id.`,
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return {
    orgId: scope.orgId,
    projectId: scope.projectId,
    envId: scope.envId,
  };
}
