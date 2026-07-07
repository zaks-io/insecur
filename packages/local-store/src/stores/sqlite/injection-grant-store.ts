import {
  environmentId,
  injectionGrantId,
  projectId,
  secretVersionId,
  type InjectionGrantId,
  type ProjectId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";

import type { LocalInjectionGrantStore } from "../../contracts/injection-grant-store.js";
import type {
  LocalConsumedInjectionGrantRow,
  LocalInsertInjectionGrantInput,
} from "../../contracts/types.js";
import type { LocalSqliteDatabase } from "../../sqlite/connection.js";
import { nowIso, parseJsonArray } from "./helpers.js";

export class SqliteLocalInjectionGrantStore implements LocalInjectionGrantStore {
  constructor(private readonly database: LocalSqliteDatabase) {}

  insertGrant(input: LocalInsertInjectionGrantInput): Promise<void> {
    if (input.bindings.length === 0) {
      throw new Error("injection grant requires at least one binding");
    }
    this.database
      .prepare(
        `INSERT INTO injection_grants
         (id, project_id, environment_id, variable_keys_json, secret_ids_json, secret_version_ids_json, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.grantId,
        input.projectId,
        input.environmentId,
        JSON.stringify(input.bindings.map((binding) => binding.variableKey)),
        JSON.stringify(input.bindings.map((binding) => binding.secretId)),
        JSON.stringify(input.bindings.map((binding) => binding.secretVersionId)),
        input.expiresAt.toISOString(),
        nowIso(),
      );
    return Promise.resolve();
  }

  tryConsumeGrant(
    projectIdValue: ProjectId,
    grantIdValue: InjectionGrantId,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): Promise<
    | { ok: true; grant: LocalConsumedInjectionGrantRow }
    | { ok: false; failure: "not_found" | "expired" | "already_consumed" | "binding_not_allowed" }
  > {
    const failure = this.classifyGrantFailure(
      projectIdValue,
      grantIdValue,
      secretIdValue,
      variableKey,
    );
    if (failure !== null) {
      return Promise.resolve({ ok: false, failure });
    }
    const row = this.getGrantRow(grantIdValue, projectIdValue);
    if (!row) {
      return Promise.resolve({ ok: false, failure: "not_found" });
    }
    const binding = this.resolveBinding(row, secretIdValue, variableKey);
    if (!binding) {
      return Promise.resolve({ ok: false, failure: "binding_not_allowed" });
    }
    if (!this.markGrantConsumed(grantIdValue, projectIdValue)) {
      return Promise.resolve({ ok: false, failure: "already_consumed" });
    }
    return Promise.resolve({
      ok: true,
      grant: {
        grantId: injectionGrantId.brand(row.id),
        projectId: projectId.brand(row.project_id),
        environmentId: environmentId.brand(row.environment_id),
        secretId: secretIdValue,
        secretVersionId: secretVersionId.brand(binding.secretVersionIdValue),
        variableKey,
      },
    });
  }

  private getGrantRow(
    grantIdValue: InjectionGrantId,
    projectIdValue: ProjectId,
  ): GrantDbRow | null {
    return (
      (this.database
        .prepare(
          `SELECT id, project_id, environment_id, variable_keys_json, secret_ids_json,
                  secret_version_ids_json, expires_at, consumed_at
           FROM injection_grants
           WHERE id = ? AND project_id = ?`,
        )
        .get(grantIdValue, projectIdValue) as GrantDbRow | undefined) ?? null
    );
  }

  private classifyGrantFailure(
    projectIdValue: ProjectId,
    grantIdValue: InjectionGrantId,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): "not_found" | "expired" | "already_consumed" | "binding_not_allowed" | null {
    const row = this.getGrantRow(grantIdValue, projectIdValue);
    if (!row) {
      return "not_found";
    }
    if (row.consumed_at !== null) {
      return "already_consumed";
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return "expired";
    }
    if (!this.resolveBinding(row, secretIdValue, variableKey)) {
      return "binding_not_allowed";
    }
    return null;
  }

  private resolveBinding(
    row: GrantDbRow,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): { secretVersionIdValue: string } | null {
    const variableKeys = parseJsonArray(row.variable_keys_json);
    const secretIds = parseJsonArray(row.secret_ids_json);
    const secretVersionIds = parseJsonArray(row.secret_version_ids_json);
    const bindingIndex = variableKeys.findIndex(
      (key, index) => key === variableKey && secretIds[index] === secretIdValue,
    );
    if (bindingIndex < 0) {
      return null;
    }
    const secretVersionIdValue = secretVersionIds[bindingIndex];
    if (secretVersionIdValue === undefined) {
      return null;
    }
    return { secretVersionIdValue };
  }

  private markGrantConsumed(grantIdValue: InjectionGrantId, projectIdValue: ProjectId): boolean {
    const updated = this.database
      .prepare(
        `UPDATE injection_grants
         SET consumed_at = ?
         WHERE id = ? AND project_id = ? AND consumed_at IS NULL`,
      )
      .run(nowIso(), grantIdValue, projectIdValue);
    return updated.changes === 1;
  }
}

interface GrantDbRow {
  id: string;
  project_id: string;
  environment_id: string;
  variable_keys_json: string;
  secret_ids_json: string;
  secret_version_ids_json: string;
  expires_at: string;
  consumed_at: string | null;
}
