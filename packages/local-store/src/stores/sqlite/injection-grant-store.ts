import {
  environmentId,
  injectionGrantId,
  projectId,
  secretVersionId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";

import type { LocalInjectionGrantStore } from "../../contracts/injection-grant-store.js";
import type {
  LocalConsumedInjectionGrantRow,
  LocalInjectionGrantConsumeInput,
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
  tryConsumeGrant(input: LocalInjectionGrantConsumeInput): Promise<ConsumeOutcome> {
    return Promise.resolve(this.atomicConsumeGrantInTransaction(input));
  }

  private atomicConsumeGrantInTransaction(input: LocalInjectionGrantConsumeInput): ConsumeOutcome {
    let outcome: ConsumeOutcome | undefined;
    withSqliteTransaction(this.database, () => {
      outcome = this.consumeGrantRowUnderLock(this.getGrantRow(input), input);
    });
    if (outcome === undefined) {
      throw new Error("injection grant consume transaction did not set an outcome");
    }
    return outcome;
  }

  private classifyConsumeFailure(
    row: GrantDbRow | null,
    input: LocalInjectionGrantConsumeInput,
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
    if (row.environment_id !== input.environmentId) {
      return "binding_not_allowed";
    }
    const binding = this.resolveBinding(row, input.secretId, input.variableKey);
    if (!binding || !this.isCurrentBinding(row, binding.secretVersionIdValue, input.secretId)) {
      return "binding_not_allowed";
    }
    return null;
  }

  private consumeGrantRowUnderLock(
    row: GrantDbRow | null,
    input: LocalInjectionGrantConsumeInput,
  ): ConsumeOutcome {
    const preflight = this.classifyConsumeFailure(row, input);
    if (preflight !== null || row === null) {
      return { ok: false, failure: preflight ?? "not_found" };
    }
    const binding = this.resolveBinding(row, input.secretId, input.variableKey);
    if (!binding) {
      return { ok: false, failure: "binding_not_allowed" };
    }
    const consumedAt = nowIso();
    const claimed = this.database
      .prepare(
        `UPDATE injection_grants
         SET consumed_at = ?
         WHERE id = ? AND project_id = ? AND environment_id = ?
           AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .run(consumedAt, row.id, row.project_id, input.environmentId, consumedAt);
    if (claimed.changes !== 1) {
      return { ok: false, failure: "already_consumed" };
    }
    return {
      ok: true,
      grant: {
        grantId: injectionGrantId.brand(row.id),
        projectId: projectId.brand(row.project_id),
        environmentId: environmentId.brand(row.environment_id),
        secretId: input.secretId,
        secretVersionId: secretVersionId.brand(binding.secretVersionIdValue),
        variableKey: input.variableKey,
      },
    };
  }

  private getGrantRow(input: LocalInjectionGrantConsumeInput): GrantDbRow | null {
    return (
      (this.database
        .prepare(
          `SELECT id, project_id, environment_id, variable_keys_json, secret_ids_json,
                  secret_version_ids_json, expires_at, consumed_at, revoked_at
           FROM injection_grants
           WHERE id = ? AND project_id = ?`,
        )
        .get(input.grantId, input.projectId) as GrantDbRow | undefined) ?? null
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

  private isCurrentBinding(
    row: GrantDbRow,
    secretVersionIdValue: string,
    secretIdValue: SecretId,
  ): boolean {
    const current = this.database
      .prepare(
        `SELECT secret_version_id
         FROM current_secret_versions
         WHERE project_id = ? AND environment_id = ? AND secret_id = ?`,
      )
      .get(row.project_id, row.environment_id, secretIdValue) as
      { secret_version_id: string } | undefined;
    return current?.secret_version_id === secretVersionIdValue;
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
