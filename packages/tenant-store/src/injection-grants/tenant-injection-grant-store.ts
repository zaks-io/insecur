import {
  environmentId,
  injectionGrantId,
  projectId,
  secretId,
  secretVersionId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import { assertProjectEnvironmentCoordinate } from "./assert-project-environment-coordinate.js";
import type { InjectionGrantRow, InsertInjectionGrantInput } from "./types.js";

export type InjectionGrantConsumeFailure =
  | "not_found"
  | "expired"
  | "already_consumed"
  | "binding_not_allowed";

export interface ConsumedInjectionGrantRow {
  grantId: InjectionGrantId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
}

/**
 * Postgres-backed one-use Injection Grant persistence (metadata only).
 */
export class TenantInjectionGrantStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async assertIssueCoordinate(input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  }): Promise<void> {
    await assertProjectEnvironmentCoordinate(this.sql, input);
  }

  async insertGrant(input: InsertInjectionGrantInput): Promise<void> {
    const { binding } = input;
    await this.sql`
      INSERT INTO injection_grants (
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        secret_ids,
        secret_version_id,
        expires_at
      )
      VALUES (
        ${input.grantId},
        ${input.organizationId},
        ${input.projectId},
        ${input.environmentId},
        ${[binding.variableKey]},
        ${[binding.secretId]},
        ${binding.secretVersionId},
        ${input.expiresAt}
      )
    `;
  }

  async getGrant(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
  ): Promise<InjectionGrantRow | null> {
    const rows = await this.sql<InjectionGrantRow[]>`
      SELECT
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        secret_ids,
        secret_version_id,
        expires_at,
        consumed_at
      FROM injection_grants
      WHERE id = ${grantIdValue}
        AND org_id = ${organizationId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  getBoundGrant(grant: InjectionGrantRow): ConsumedInjectionGrantRow | null {
    if (grant.secret_ids.length !== 1 || grant.variable_keys.length !== 1) {
      return null;
    }
    const boundSecretId = grant.secret_ids[0];
    const boundVariableKey = grant.variable_keys[0];
    const boundVersionId = grant.secret_version_id;
    if (boundSecretId === undefined || boundVariableKey === undefined || boundVersionId === null) {
      return null;
    }
    return {
      grantId: injectionGrantId.brand(grant.id),
      projectId: projectId.brand(grant.project_id),
      environmentId: environmentId.brand(grant.environment_id),
      secretId: secretId.brand(boundSecretId),
      secretVersionId: secretVersionId.brand(boundVersionId),
      variableKey: boundVariableKey as VariableKey,
    };
  }

  classifyConsumeFailure(
    grant: InjectionGrantRow | null,
    requestedSecretId: SecretId,
    requestedVariableKey: VariableKey,
  ): InjectionGrantConsumeFailure | null {
    if (!grant) {
      return "not_found";
    }
    const bound = this.getBoundGrant(grant);
    if (!bound) {
      return "not_found";
    }
    if (bound.secretId !== requestedSecretId || bound.variableKey !== requestedVariableKey) {
      return "binding_not_allowed";
    }
    if (grant.consumed_at !== null) {
      return "already_consumed";
    }
    if (grant.expires_at.getTime() <= Date.now()) {
      return "expired";
    }
    return null;
  }

  async tryConsumeGrant(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
    requestedSecretId: SecretId,
    requestedVariableKey: VariableKey,
  ): Promise<
    | { ok: true; grant: ConsumedInjectionGrantRow }
    | { ok: false; reason: InjectionGrantConsumeFailure }
  > {
    const existing = await this.getGrant(organizationId, grantIdValue);
    const preflight = this.classifyConsumeFailure(
      existing,
      requestedSecretId,
      requestedVariableKey,
    );
    if (preflight !== null || existing === null) {
      return { ok: false, reason: preflight ?? "not_found" };
    }

    const boundBeforeConsume = this.getBoundGrant(existing);
    if (!boundBeforeConsume) {
      return { ok: false, reason: "not_found" };
    }

    const consumed = await this.performConsumeUpdate({
      organizationId,
      grantId: grantIdValue,
      bound: boundBeforeConsume,
      requestedSecretId,
      requestedVariableKey,
    });
    if (!consumed) {
      return this.failureAfterConsumeRace(
        organizationId,
        grantIdValue,
        requestedSecretId,
        requestedVariableKey,
      );
    }

    const consumedBound = this.getBoundGrant(consumed);
    if (!consumedBound) {
      return { ok: false, reason: "not_found" };
    }

    return { ok: true, grant: consumedBound };
  }

  private async performConsumeUpdate(input: {
    organizationId: OrganizationId;
    grantId: InjectionGrantId;
    bound: ConsumedInjectionGrantRow;
    requestedSecretId: SecretId;
    requestedVariableKey: VariableKey;
  }): Promise<InjectionGrantRow | null> {
    const rows = await this.sql<InjectionGrantRow[]>`
      UPDATE injection_grants
      SET consumed_at = now()
      WHERE id = ${input.grantId}
        AND org_id = ${input.organizationId}
        AND consumed_at IS NULL
        AND expires_at > now()
        AND cardinality(secret_ids) = 1
        AND cardinality(variable_keys) = 1
        AND secret_version_id = ${input.bound.secretVersionId}
        AND ${input.requestedSecretId} = ANY (secret_ids)
        AND ${input.requestedVariableKey} = ANY (variable_keys)
      RETURNING
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        secret_ids,
        secret_version_id,
        expires_at,
        consumed_at
    `;
    return rows[0] ?? null;
  }

  private async failureAfterConsumeRace(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
    requestedSecretId: SecretId,
    requestedVariableKey: VariableKey,
  ): Promise<{ ok: false; reason: InjectionGrantConsumeFailure }> {
    const refreshed = await this.getGrant(organizationId, grantIdValue);
    const reason =
      this.classifyConsumeFailure(refreshed, requestedSecretId, requestedVariableKey) ??
      "not_found";
    return { ok: false, reason };
  }
}
