import { CLI_ERROR_CODES, secretId, type EnvironmentId, type ProjectId } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import type { InsecurProjectConfig } from "../config/project-config.js";
import { CliError } from "../output/cli-error.js";
import { INIT_REMEDIATION } from "../output/cli-remediation.js";

export async function assertLocalProjectReady(
  store: LocalStore,
  projectId: ProjectId,
  environmentId: EnvironmentId,
): Promise<void> {
  const project = await store.projects.getProject(projectId);
  if (project === null) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message:
          "Local project metadata is missing on this machine. Run insecur init in this directory.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
  const environment = await store.projects.getEnvironment(projectId, environmentId);
  if (environment === null) {
    throw new CliError(
      {
        code: CLI_ERROR_CODES.parentScopeUnresolved,
        message:
          "Local environment metadata is missing on this machine. Run insecur init in this directory.",
        retryable: false,
      },
      { remediation: INIT_REMEDIATION },
    );
  }
}

export async function syncSecretShapesFromConfig(
  store: LocalStore,
  projectConfig: InsecurProjectConfig | null,
  projectId: ProjectId,
): Promise<void> {
  if (projectConfig?.secretShapes === undefined) {
    return;
  }
  for (const shape of projectConfig.secretShapes) {
    const existing = await store.projects.getSecretShape(projectId, shape.variableKey);
    if (existing !== null) {
      continue;
    }
    await store.projects.upsertSecretShape({
      projectId,
      variableKey: shape.variableKey,
      secretId: secretId.generate(),
      displayName: shape.displayName ?? null,
      description: shape.description ?? null,
      required: shape.required === true,
      generationHint: shape.generationHint ?? null,
    });
  }
}
