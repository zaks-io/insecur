import type { EnvironmentId, ProjectId } from "@insecur/domain";

import type {
  LocalEnvironmentRow,
  LocalProjectRow,
  LocalSecretShapeRow,
  LocalUpsertSecretShapeInput,
} from "./types.js";

/** Local project, environment, and Secret Shape metadata. */
export interface LocalProjectMetadataStore {
  createProject(projectId: ProjectId, displayName?: string | null): Promise<LocalProjectRow>;
  getProject(projectId: ProjectId): Promise<LocalProjectRow | null>;
  createEnvironment(
    projectId: ProjectId,
    environmentId: EnvironmentId,
    displayName?: string | null,
  ): Promise<LocalEnvironmentRow>;
  getEnvironment(
    projectId: ProjectId,
    environmentId: EnvironmentId,
  ): Promise<LocalEnvironmentRow | null>;
  upsertSecretShape(input: LocalUpsertSecretShapeInput): Promise<LocalSecretShapeRow>;
  getSecretShape(projectId: ProjectId, variableKey: string): Promise<LocalSecretShapeRow | null>;
  listSecretShapes(projectId: ProjectId): Promise<readonly LocalSecretShapeRow[]>;
  /**
   * Removes the project row and, via schema cascades, its environments, Secret Shapes, wrapped
   * Current Versions, and injection grants. Audit rows survive with their project reference
   * nulled. This is the migrate verified-then-clean step (ADR-0080); callers must have proven
   * every value present remotely before invoking it. Returns false when no such project exists.
   */
  deleteProject(projectId: ProjectId): Promise<boolean>;
}
