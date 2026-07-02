import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { CliError } from "../output/cli-error.js";

export type ParentScopeLevel = "organization" | "project" | "environment";

export interface ParentScopePins {
  readonly orgId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly envId?: EnvironmentId;
}

const LEVEL_LABEL: Record<ParentScopeLevel, string> = {
  organization: "organization",
  project: "project",
  environment: "environment",
};

function missingScopeMessage(requiredLevel: ParentScopeLevel, flagLabel: string): string {
  return `Cannot resolve ${flagLabel} before ${LEVEL_LABEL[requiredLevel]} scope is pinned.`;
}

export function assertParentScopeResolved(
  scope: ParentScopePins,
  requiredLevel: ParentScopeLevel,
  flagLabel: string,
): void {
  if (requiredLevel === "organization" && scope.orgId === undefined) {
    throw new CliError({
      code: CLI_ERROR_CODES.parentScopeUnresolved,
      message: missingScopeMessage("organization", flagLabel),
      retryable: false,
    });
  }
  if (
    (requiredLevel === "project" || requiredLevel === "environment") &&
    scope.projectId === undefined
  ) {
    throw new CliError({
      code: CLI_ERROR_CODES.parentScopeUnresolved,
      message: missingScopeMessage("project", flagLabel),
      retryable: false,
    });
  }
  if (requiredLevel === "environment" && scope.envId === undefined) {
    throw new CliError({
      code: CLI_ERROR_CODES.parentScopeUnresolved,
      message: missingScopeMessage("environment", flagLabel),
      retryable: false,
    });
  }
}
