import {
  environmentId,
  projectId,
  secretId,
  type EnvironmentId,
  type ProjectId,
} from "@insecur/domain";

import type { LocalProjectMetadataStore } from "../../contracts/project-metadata-store.js";
import type {
  LocalEnvironmentRow,
  LocalProjectRow,
  LocalSecretShapeRow,
  LocalUpsertSecretShapeInput,
} from "../../contracts/types.js";
import type { LocalSqliteDatabase } from "../../sqlite/connection.js";
import { withSqliteTransaction } from "../../sqlite/transaction.js";
import { assertOpaqueId, brandVariableKey, nowIso } from "./helpers.js";

export class SqliteLocalProjectMetadataStore implements LocalProjectMetadataStore {
  constructor(private readonly database: LocalSqliteDatabase) {}

  createProject(projectIdValue: ProjectId, displayName?: string | null): Promise<LocalProjectRow> {
    assertOpaqueId(projectIdValue, "projectId");
    const createdAt = nowIso();
    this.database
      .prepare(`INSERT INTO projects (id, display_name, created_at) VALUES (?, ?, ?)`)
      .run(projectIdValue, displayName ?? null, createdAt);
    return Promise.resolve({ projectId: projectIdValue, displayName: displayName ?? null });
  }

  getProject(projectIdValue: ProjectId): Promise<LocalProjectRow | null> {
    const row = this.database
      .prepare(`SELECT id, display_name FROM projects WHERE id = ?`)
      .get(projectIdValue) as { id: string; display_name: string | null } | undefined;
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      projectId: projectId.brand(row.id),
      displayName: row.display_name,
    });
  }

  createEnvironment(
    projectIdValue: ProjectId,
    environmentIdValue: EnvironmentId,
    displayName?: string | null,
  ): Promise<LocalEnvironmentRow> {
    assertOpaqueId(projectIdValue, "projectId");
    assertOpaqueId(environmentIdValue, "environmentId");
    const createdAt = nowIso();
    this.database
      .prepare(
        `INSERT INTO environments (id, project_id, display_name, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(environmentIdValue, projectIdValue, displayName ?? null, createdAt);
    return Promise.resolve({
      projectId: projectIdValue,
      environmentId: environmentIdValue,
      displayName: displayName ?? null,
    });
  }

  getEnvironment(
    projectIdValue: ProjectId,
    environmentIdValue: EnvironmentId,
  ): Promise<LocalEnvironmentRow | null> {
    const row = this.database
      .prepare(
        `SELECT id, project_id, display_name
         FROM environments
         WHERE project_id = ? AND id = ?`,
      )
      .get(projectIdValue, environmentIdValue) as
      { id: string; project_id: string; display_name: string | null } | undefined;
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      projectId: projectId.brand(row.project_id),
      environmentId: environmentId.brand(row.id),
      displayName: row.display_name,
    });
  }

  upsertSecretShape(input: LocalUpsertSecretShapeInput): Promise<LocalSecretShapeRow> {
    assertOpaqueId(input.projectId, "projectId");
    assertOpaqueId(input.secretId, "secretId");
    assertOpaqueId(input.variableKey, "variableKey");
    let row: LocalSecretShapeRow | undefined;
    withSqliteTransaction(this.database, () => {
      const existing = this.database
        .prepare(`SELECT secret_id FROM secret_shapes WHERE project_id = ? AND variable_key = ?`)
        .get(input.projectId, input.variableKey) as { secret_id: string } | undefined;
      if (existing) {
        this.updateSecretShape(input);
        row = this.toSecretShapeRow(input, existing.secret_id);
        return;
      }
      this.insertSecretShape(input);
      row = this.toSecretShapeRow(input, input.secretId);
    });
    if (row === undefined) {
      throw new Error("secret shape upsert did not produce a row");
    }
    return Promise.resolve(row);
  }

  private updateSecretShape(input: LocalUpsertSecretShapeInput): void {
    this.database
      .prepare(
        `UPDATE secret_shapes
         SET display_name = ?, description = ?, required = ?, generation_hint = ?, updated_at = ?
         WHERE project_id = ? AND variable_key = ?`,
      )
      .run(
        input.displayName ?? null,
        input.description ?? null,
        input.required === true ? 1 : 0,
        input.generationHint ?? null,
        nowIso(),
        input.projectId,
        input.variableKey,
      );
  }

  private insertSecretShape(input: LocalUpsertSecretShapeInput): void {
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO secret_shapes
         (project_id, variable_key, secret_id, display_name, description, required, generation_hint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.projectId,
        input.variableKey,
        input.secretId,
        input.displayName ?? null,
        input.description ?? null,
        input.required === true ? 1 : 0,
        input.generationHint ?? null,
        timestamp,
        timestamp,
      );
  }

  getSecretShape(
    projectIdValue: ProjectId,
    variableKey: string,
  ): Promise<LocalSecretShapeRow | null> {
    const row = this.database
      .prepare(
        `SELECT project_id, variable_key, secret_id, display_name, description, required, generation_hint
         FROM secret_shapes
         WHERE project_id = ? AND variable_key = ?`,
      )
      .get(projectIdValue, variableKey) as SecretShapeDbRow | undefined;
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.mapSecretShapeRow(row));
  }

  listSecretShapes(projectIdValue: ProjectId): Promise<readonly LocalSecretShapeRow[]> {
    const rows = this.database
      .prepare(
        `SELECT project_id, variable_key, secret_id, display_name, description, required, generation_hint
         FROM secret_shapes
         WHERE project_id = ?
         ORDER BY variable_key ASC`,
      )
      .all(projectIdValue) as unknown as SecretShapeDbRow[];
    return Promise.resolve(rows.map((row) => this.mapSecretShapeRow(row)));
  }

  private toSecretShapeRow(
    input: LocalUpsertSecretShapeInput,
    secretIdValue: string,
  ): LocalSecretShapeRow {
    return {
      projectId: input.projectId,
      variableKey: input.variableKey,
      secretId: secretId.brand(secretIdValue),
      displayName: input.displayName ?? null,
      description: input.description ?? null,
      required: input.required === true,
      generationHint: input.generationHint ?? null,
    };
  }

  private mapSecretShapeRow(row: SecretShapeDbRow): LocalSecretShapeRow {
    return {
      projectId: projectId.brand(row.project_id),
      variableKey: brandVariableKey(row.variable_key),
      secretId: secretId.brand(row.secret_id),
      displayName: row.display_name,
      description: row.description,
      required: row.required === 1,
      generationHint: row.generation_hint,
    };
  }
}

interface SecretShapeDbRow {
  project_id: string;
  variable_key: string;
  secret_id: string;
  display_name: string | null;
  description: string | null;
  required: number;
  generation_hint: string | null;
}
