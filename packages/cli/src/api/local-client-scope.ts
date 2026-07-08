import type { EnvironmentId, ProjectId } from "@insecur/domain";
import type { ResolvedCliContext } from "../config/load-cli-context.js";

export function requireLocalProjectId(context: ResolvedCliContext): ProjectId {
  const projectId = context.scope.projectId;
  if (projectId === undefined) {
    throw new Error("local project scope is missing projectId");
  }
  return projectId;
}

export function requireLocalEnvironmentId(context: ResolvedCliContext): EnvironmentId {
  const environmentId = context.scope.envId;
  if (environmentId === undefined) {
    throw new Error("local project scope is missing envId");
  }
  return environmentId;
}
