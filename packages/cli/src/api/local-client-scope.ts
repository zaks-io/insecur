import type { EnvironmentId, ProjectId } from "@insecur/domain";
import { CLI_ERROR_CODES } from "@insecur/domain";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { INIT_REMEDIATION } from "../output/cli-remediation.js";

export function requireLocalProjectId(context: ResolvedCliContext): ProjectId {
  const projectId = context.scope.projectId;
  if (projectId === undefined) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message: "Missing local project scope. Run insecur init to set up this project first.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return projectId;
}

export function requireLocalEnvironmentId(context: ResolvedCliContext): EnvironmentId {
  const environmentId = context.scope.envId;
  if (environmentId === undefined) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message: "Missing local environment scope. Run insecur init to set up this project first.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  return environmentId;
}
