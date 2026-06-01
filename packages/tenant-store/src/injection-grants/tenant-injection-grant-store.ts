import {
  environmentId,
  injectionGrantId,
  projectId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import type { InjectionGrantRow, InsertInjectionGrantInput } from "./types.js";

export type InjectionGrantConsumeFailure =
  | "not_found"
  | "expired"
  | "already_consumed"
  | "variable_key_not_allowed";

export interface ConsumedInjectionGrantRow {
  grantId: InjectionGrantId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKeys: readonly VariableKey[];
}

/**
 * Postgres-backed one-use Injection Grant persistence (metadata only).
 */
export class TenantInjectionGrantStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async assertNonProtectedEnvironment(
    organizationId: OrganizationId,
    environmentIdValue: EnvironmentId,
  ): Promise<void> {
    const rows = await this.sql<{ is_protected: boolean }[]>`
      SELECT is_protected
      FROM environments
      WHERE org_id = ${organizationId}
        AND id = ${environmentIdValue}
      LIMIT 1
    `;
    const environment = rows[0];
    if (!environment || environment.is_protected) {
      throw new Error("environment is protected or missing");
    }
  }

  async insertGrant(input: InsertInjectionGrantInput): Promise<void> {
    await this.sql`
      INSERT INTO injection_grants (
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        expires_at
      )
      VALUES (
        ${input.grantId},
        ${input.organizationId},
        ${input.projectId},
        ${input.environmentId},
        ${[...input.variableKeys]},
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
    requestedVariableKey: VariableKey,
  ): InjectionGrantConsumeFailure | null {
    if (!grant) {
      return "not_found";
    }
    if (!grant.variable_keys.includes(requestedVariableKey)) {
      return "variable_key_not_allowed";
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
    requestedVariableKey: VariableKey,
  ): Promise<
    | { ok: true; grant: ConsumedInjectionGrantRow }
    | { ok: false; reason: InjectionGrantConsumeFailure }
  > {
    const existing = await this.getGrant(organizationId, grantIdValue);
    const preflight = this.classifyConsumeFailure(existing, requestedVariableKey);
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
        AND ${requestedVariableKey} = ANY (variable_keys)
      RETURNING
        id,
        org_id,
        project_id,
        environment_id,
        variable_keys,
        expires_at,
        consumed_at
    `;
    const consumed = rows[0];
    if (!consumed) {
      const refreshed = await this.getGrant(organizationId, grantIdValue);
      const reason = this.classifyConsumeFailure(refreshed, requestedVariableKey) ?? "not_found";
      return { ok: false, reason };
    }

    return {
      ok: true,
      grant: {
        grantId: injectionGrantId.brand(consumed.id),
        projectId: projectId.brand(consumed.project_id),
        environmentId: environmentId.brand(consumed.environment_id),
        variableKeys: consumed.variable_keys as VariableKey[],
      },
    };
  }
}
