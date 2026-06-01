import {
  environmentId,
  injectionGrantId,
  projectId,
  secretId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
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
  secretIds: readonly SecretId[];
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
    const secretIds = input.bindings.map((binding) => binding.secretId);
    const variableKeys = input.bindings.map((binding) => binding.variableKey);
    await this.sql`
      INSERT INTO injection_grants (
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        secret_ids,
        expires_at
      )
      VALUES (
        ${input.grantId},
        ${input.organizationId},
        ${input.projectId},
        ${input.environmentId},
        ${variableKeys},
        ${secretIds},
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
        expires_at,
        consumed_at
      FROM injection_grants
      WHERE id = ${grantIdValue}
        AND org_id = ${organizationId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  classifyConsumeFailure(
    grant: InjectionGrantRow | null,
    requestedSecretId: SecretId,
  ): InjectionGrantConsumeFailure | null {
    if (!grant) {
      return "not_found";
    }
    if (!grant.secret_ids.includes(requestedSecretId)) {
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
  ): Promise<
    | { ok: true; grant: ConsumedInjectionGrantRow }
    | { ok: false; reason: InjectionGrantConsumeFailure }
  > {
    const existing = await this.getGrant(organizationId, grantIdValue);
    const preflight = this.classifyConsumeFailure(existing, requestedSecretId);
    if (preflight !== null) {
      return { ok: false, reason: preflight };
    }

    const rows = await this.sql<InjectionGrantRow[]>`
      UPDATE injection_grants
      SET consumed_at = now()
      WHERE id = ${grantIdValue}
        AND org_id = ${organizationId}
        AND consumed_at IS NULL
        AND expires_at > now()
        AND ${requestedSecretId} = ANY (secret_ids)
      RETURNING
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        secret_ids,
        expires_at,
        consumed_at
    `;
    const consumed = rows[0];
    if (!consumed) {
      const refreshed = await this.getGrant(organizationId, grantIdValue);
      const reason = this.classifyConsumeFailure(refreshed, requestedSecretId) ?? "not_found";
      return { ok: false, reason };
    }

    return {
      ok: true,
      grant: {
        grantId: injectionGrantId.brand(consumed.id),
        projectId: projectId.brand(consumed.project_id),
        environmentId: environmentId.brand(consumed.environment_id),
        secretIds: consumed.secret_ids.map((id) => secretId.brand(id)),
      },
    };
  }
}
