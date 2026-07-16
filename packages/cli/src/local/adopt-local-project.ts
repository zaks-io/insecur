import type { EnvironmentId, ProjectId } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import { isLocalModeHost } from "../config/local-mode.js";
import type { InsecurProjectConfig } from "../config/project-config.js";
import { syncSecretShapesFromConfig } from "./sync-local-project.js";

export interface LocalProjectAdoptionResult {
  readonly adoptedProject: boolean;
  readonly adoptedEnvironment: boolean;
}

const NO_ADOPTION: LocalProjectAdoptionResult = {
  adoptedProject: false,
  adoptedEnvironment: false,
};

function committedEnvironmentIds(config: InsecurProjectConfig): ReadonlySet<EnvironmentId> {
  return new Set<EnvironmentId>([
    config.defaultEnvId,
    ...Object.values(config.gitBranchToEnvironment ?? {}),
  ]);
}

function configOwnsProject(
  config: InsecurProjectConfig | null,
  projectId: ProjectId,
): config is InsecurProjectConfig {
  return config !== null && isLocalModeHost(config.host) && config.projectId === projectId;
}

/**
 * Second-machine auto-adopt (ADR-0080): when a committed `"host": "local"`
 * config names a project this machine's store has never seen, create the
 * project/environment records under the committed IDs and sync the committed
 * Secret Shape manifest. Creates ID records only — never values or ciphertext.
 * Idempotent and silent when the records already exist; a no-op when the
 * committed config does not own the requested project.
 */
export async function adoptLocalProjectFromConfig(input: {
  readonly store: LocalStore;
  readonly projectConfig: InsecurProjectConfig | null;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<LocalProjectAdoptionResult> {
  const { store, projectConfig, projectId, environmentId } = input;
  if (!configOwnsProject(projectConfig, projectId)) {
    return NO_ADOPTION;
  }

  const adoptedProject = (await store.projects.getProject(projectId)) === null;
  if (adoptedProject) {
    await store.projects.createProject(projectId);
  }

  let adoptedEnvironment = false;
  if (committedEnvironmentIds(projectConfig).has(environmentId)) {
    adoptedEnvironment = (await store.projects.getEnvironment(projectId, environmentId)) === null;
    if (adoptedEnvironment) {
      await store.projects.createEnvironment(
        projectId,
        environmentId,
        environmentId === projectConfig.defaultEnvId ? "Development" : null,
      );
    }
  }

  await syncSecretShapesFromConfig(store, projectConfig, projectId);
  return { adoptedProject, adoptedEnvironment };
}
