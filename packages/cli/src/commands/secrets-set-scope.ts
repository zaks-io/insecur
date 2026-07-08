import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { LOCAL_MODE_ORGANIZATION_ID } from "@insecur/local-store";
import { isLocalModeHost } from "../config/local-mode.js";
import type { ResolvedCliScope } from "../config/resolve-scope.js";
import { CliError } from "../output/cli-error.js";
import { INIT_REMEDIATION } from "../output/cli-remediation.js";

export interface ResolvedSecretWriteScope {
  readonly orgId: OrganizationId;
  readonly projectId: ProjectId;
  readonly envId: EnvironmentId;
  readonly localMode: boolean;
}

export function requireSecretWriteScope(scope: ResolvedCliScope): ResolvedSecretWriteScope {
  const localMode = isLocalModeHost(scope.host);
  if (scope.projectId === undefined || scope.envId === undefined) {
    const missing: string[] = [];
    if (scope.projectId === undefined) {
      missing.push("project");
    }
    if (scope.envId === undefined) {
      missing.push("environment");
    }
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message: `Missing ${missing.join(", ")} scope. Run insecur init or pass --project-id and --env-id.`,
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  if (localMode) {
    return {
      orgId: LOCAL_MODE_ORGANIZATION_ID,
      projectId: scope.projectId,
      envId: scope.envId,
      localMode: true,
    };
  }
  if (scope.orgId === undefined) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message:
          "Missing organization scope. Run insecur init or pass --org-id, --project-id, and --env-id.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return {
    orgId: scope.orgId,
    projectId: scope.projectId,
    envId: scope.envId,
    localMode: false,
  };
}
