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
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { injectionGrants } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
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
  constructor(private readonly db: TenantScopedDb) {}

  async assertIssueCoordinate(input: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  }): Promise<{ isProtected: boolean }> {
    return assertProjectEnvironmentCoordinate(this.db, input);
  }

  async insertGrant(input: InsertInjectionGrantInput): Promise<void> {
    const { binding } = input;
    await this.db.insert(injectionGrants).values({
      id: input.grantId,
      orgId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      variableKeys: [binding.variableKey],
      secretIds: [binding.secretId],
      secretVersionId: binding.secretVersionId,
      expiresAt: input.expiresAt,
    });
  }

  async getGrant(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
  ): Promise<InjectionGrantRow | null> {
    const rows = await this.db
      .select({
        id: injectionGrants.id,
        org_id: injectionGrants.orgId,
        project_id: injectionGrants.projectId,
        environment_id: injectionGrants.environmentId,
        variable_keys: injectionGrants.variableKeys,
        secret_ids: injectionGrants.secretIds,
        secret_version_id: injectionGrants.secretVersionId,
        expires_at: injectionGrants.expiresAt,
        consumed_at: injectionGrants.consumedAt,
      })
      .from(injectionGrants)
      .where(and(eq(injectionGrants.id, grantIdValue), eq(injectionGrants.orgId, organizationId)))
      .limit(1);
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
    const rows = await this.db
      .update(injectionGrants)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(injectionGrants.id, input.grantId),
          eq(injectionGrants.orgId, input.organizationId),
          isNull(injectionGrants.consumedAt),
          gt(injectionGrants.expiresAt, sql`now()`),
          sql`cardinality(${injectionGrants.secretIds}) = 1`,
          sql`cardinality(${injectionGrants.variableKeys}) = 1`,
          eq(injectionGrants.secretVersionId, input.bound.secretVersionId),
          sql`${input.requestedSecretId} = ANY (${injectionGrants.secretIds})`,
          sql`${input.requestedVariableKey} = ANY (${injectionGrants.variableKeys})`,
        ),
      )
      .returning({
        id: injectionGrants.id,
        org_id: injectionGrants.orgId,
        project_id: injectionGrants.projectId,
        environment_id: injectionGrants.environmentId,
        variable_keys: injectionGrants.variableKeys,
        secret_ids: injectionGrants.secretIds,
        secret_version_id: injectionGrants.secretVersionId,
        expires_at: injectionGrants.expiresAt,
        consumed_at: injectionGrants.consumedAt,
      });
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
