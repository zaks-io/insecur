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
import { withSqliteTransaction } from "../../sqlite/transaction.js";
import { assertOpaqueId, nowIso, parseJsonArray } from "./helpers.js";

type ConsumeFailure =
  "not_found" | "expired" | "already_consumed" | "binding_not_allowed" | "revoked";

type ConsumeOutcome =
  { ok: true; grant: LocalConsumedInjectionGrantRow } | { ok: false; failure: ConsumeFailure };

export class SqliteLocalInjectionGrantStore implements LocalInjectionGrantStore {
  constructor(private readonly database: LocalSqliteDatabase) {}

  insertGrant(input: LocalInsertInjectionGrantInput): Promise<void> {
    if (input.bindings.length === 0) {
      throw new Error("injection grant requires at least one binding");
    }
    assertOpaqueId(input.grantId, "grantId");
    assertOpaqueId(input.projectId, "projectId");
    assertOpaqueId(input.environmentId, "environmentId");
    for (const binding of input.bindings) {
      assertOpaqueId(binding.secretId, "secretId");
      assertOpaqueId(binding.secretVersionId, "secretVersionId");
      assertOpaqueId(binding.variableKey, "variableKey");
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

  /**
   * One-use consume runs entirely inside `BEGIN IMMEDIATE`: the write lock serializes
   * overlapping consumers, and the conditional `UPDATE ... WHERE consumed_at IS NULL`
   * is the single atomic claim primitive (no separate pre-classify/mark split).
   */
  tryConsumeGrant(
    projectIdValue: ProjectId,
    grantIdValue: InjectionGrantId,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): Promise<ConsumeOutcome> {
    return Promise.resolve(
      this.atomicConsumeGrantInTransaction(
        projectIdValue,
        grantIdValue,
        secretIdValue,
        variableKey,
      ),
    );
  }

  private atomicConsumeGrantInTransaction(
    projectIdValue: ProjectId,
    grantIdValue: InjectionGrantId,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): ConsumeOutcome {
    let outcome: ConsumeOutcome | undefined;
    withSqliteTransaction(this.database, () => {
      outcome = this.consumeGrantRowUnderLock(
        this.getGrantRow(grantIdValue, projectIdValue),
        secretIdValue,
        variableKey,
      );
    });
    if (outcome === undefined) {
      throw new Error("injection grant consume transaction did not set an outcome");
    }
    return outcome;
  }

  private classifyConsumeFailure(
    row: GrantDbRow | null,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): ConsumeFailure | null {
    if (!row) {
      return "not_found";
    }
    if (row.consumed_at !== null) {
      return "already_consumed";
    }
    if (row.revoked_at !== null) {
      return "revoked";
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return "expired";
    }
    if (!this.resolveBinding(row, secretIdValue, variableKey)) {
      return "binding_not_allowed";
    }
    return null;
  }

  private consumeGrantRowUnderLock(
    row: GrantDbRow | null,
    secretIdValue: SecretId,
    variableKey: VariableKey,
  ): ConsumeOutcome {
    const preflight = this.classifyConsumeFailure(row, secretIdValue, variableKey);
    if (preflight !== null || row === null) {
      return { ok: false, failure: preflight ?? "not_found" };
    }
    const binding = this.resolveBinding(row, secretIdValue, variableKey);
    if (!binding) {
      return { ok: false, failure: "binding_not_allowed" };
    }
    const consumedAt = nowIso();
    const claimed = this.database
      .prepare(
        `UPDATE injection_grants
         SET consumed_at = ?
         WHERE id = ? AND project_id = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .run(consumedAt, row.id, row.project_id, consumedAt);
    if (claimed.changes !== 1) {
      return { ok: false, failure: "already_consumed" };
    }
    return {
      ok: true,
      grant: {
        grantId: injectionGrantId.brand(row.id),
        projectId: projectId.brand(row.project_id),
        environmentId: environmentId.brand(row.environment_id),
        secretId: secretIdValue,
        secretVersionId: secretVersionId.brand(binding.secretVersionIdValue),
        variableKey,
      },
    };
  }

  private getGrantRow(
    grantIdValue: InjectionGrantId,
    projectIdValue: ProjectId,
  ): GrantDbRow | null {
    return (
      (this.database
        .prepare(
          `SELECT id, project_id, environment_id, variable_keys_json, secret_ids_json,
                  secret_version_ids_json, expires_at, consumed_at, revoked_at
           FROM injection_grants
           WHERE id = ? AND project_id = ?`,
        )
        .get(grantIdValue, projectIdValue) as GrantDbRow | undefined) ?? null
    );
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
  revoked_at: string | null;
}
