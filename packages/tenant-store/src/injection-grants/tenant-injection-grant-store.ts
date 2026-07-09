import type {
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  EnvironmentId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { injectionGrants } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { assertProjectEnvironmentCoordinate } from "./assert-project-environment-coordinate.js";
import * as grantBindings from "./injection-grant-bindings.js";
import {
  injectionGrantRowSelection,
  performConsumeAllUpdate,
  performConsumeUpdate,
} from "./injection-grant-consume-sql.js";
import {
  revokeActiveInjectionGrantsForOrganization,
  revokeActiveInjectionGrantsForSecretVersion,
} from "./injection-grant-revoke-sql.js";
import type {
  ConsumedInjectionGrantRow,
  InjectionGrantConsumeFailure,
  InjectionGrantRow,
  InsertInjectionGrantInput,
} from "./types.js";
import { INJECTION_GRANT_REVOCATION_REASONS } from "./types.js";

export type { ConsumedInjectionGrantRow, InjectionGrantConsumeFailure } from "./types.js";

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
    if (input.bindings.length === 0) {
      throw new Error("injection grant requires at least one binding");
    }
    const variableKeys = input.bindings.map((binding) => binding.variableKey);
    const secretIds = input.bindings.map((binding) => binding.secretId);
    const secretVersionIds = input.bindings.map((binding) => binding.secretVersionId);
    await this.db.insert(injectionGrants).values({
      id: input.grantId,
      orgId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      variableKeys,
      secretIds,
      secretVersionIds,
      issuedActorType: input.issuedTo.type,
      issuedUserId: input.issuedTo.type === "user" ? input.issuedTo.userId : null,
      issuedMachineIdentityId:
        input.issuedTo.type === "machine" ? input.issuedTo.machineIdentityId : null,
      issuedRuntimePolicyKeyId:
        input.issuedTo.type === "machine" ? (input.issuedTo.runtimePolicyKeyId ?? null) : null,
      ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
      ...(input.policyVersionId === undefined ? {} : { policyVersionId: input.policyVersionId }),
      expiresAt: input.expiresAt,
    });
  }

  async getGrant(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
  ): Promise<InjectionGrantRow | null> {
    const rows = await this.db
      .select(injectionGrantRowSelection)
      .from(injectionGrants)
      .where(and(eq(injectionGrants.id, grantIdValue), eq(injectionGrants.orgId, organizationId)))
      .limit(1);
    return rows[0] ?? null;
  }

  isPolicyBackedGrant(grant: InjectionGrantRow): boolean {
    return grantBindings.isPolicyBackedGrant(grant);
  }

  getBoundGrants(grant: InjectionGrantRow): ConsumedInjectionGrantRow[] | null {
    return grantBindings.getBoundGrants(grant);
  }

  getBoundGrant(grant: InjectionGrantRow): ConsumedInjectionGrantRow | null {
    return grantBindings.getBoundGrant(grant);
  }

  classifyConsumeFailure(
    grant: InjectionGrantRow | null,
    requestedSecretId: SecretId,
    requestedVariableKey: VariableKey,
  ): InjectionGrantConsumeFailure | null {
    return grantBindings.classifyConsumeFailure(grant, requestedSecretId, requestedVariableKey);
  }

  classifyConsumeAllFailure(grant: InjectionGrantRow | null): InjectionGrantConsumeFailure | null {
    return grantBindings.classifyConsumeAllFailure(grant);
  }

  async revokeActiveGrantsForOrganization(
    organizationId: OrganizationId,
  ): Promise<InjectionGrantId[]> {
    return revokeActiveInjectionGrantsForOrganization(this.db, {
      organizationId,
      reason: INJECTION_GRANT_REVOCATION_REASONS.tenantSuspension,
    });
  }

  async revokeActiveGrantsForSecretVersion(
    organizationId: OrganizationId,
    secretVersionId: SecretVersionId,
  ): Promise<InjectionGrantId[]> {
    return revokeActiveInjectionGrantsForSecretVersion(this.db, {
      organizationId,
      secretVersionId,
      reason: INJECTION_GRANT_REVOCATION_REASONS.compromiseVersionInvalidation,
    });
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

    const consumed = await performConsumeUpdate(this.db, {
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

  async tryConsumeGrantAll(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
  ): Promise<
    | { ok: true; grants: ConsumedInjectionGrantRow[] }
    | { ok: false; reason: InjectionGrantConsumeFailure }
  > {
    const existing = await this.getGrant(organizationId, grantIdValue);
    const preflight = this.classifyConsumeAllFailure(existing);
    if (preflight !== null || existing === null) {
      return { ok: false, reason: preflight ?? "not_found" };
    }

    const boundBeforeConsume = this.getBoundGrants(existing);
    if (!boundBeforeConsume?.length) {
      return { ok: false, reason: "not_found" };
    }

    return this.finalizeConsumeGrantAll(organizationId, grantIdValue);
  }

  private async finalizeConsumeGrantAll(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
  ): Promise<
    | { ok: true; grants: ConsumedInjectionGrantRow[] }
    | { ok: false; reason: InjectionGrantConsumeFailure }
  > {
    const consumed = await performConsumeAllUpdate(this.db, {
      organizationId,
      grantId: grantIdValue,
    });
    if (!consumed) {
      return this.failureAfterConsumeAllRace(organizationId, grantIdValue);
    }

    const consumedBindings = this.getBoundGrants(consumed);
    if (!consumedBindings?.length) {
      return { ok: false, reason: "not_found" };
    }

    return { ok: true, grants: consumedBindings };
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

  private async failureAfterConsumeAllRace(
    organizationId: OrganizationId,
    grantIdValue: InjectionGrantId,
  ): Promise<{ ok: false; reason: InjectionGrantConsumeFailure }> {
    const refreshed = await this.getGrant(organizationId, grantIdValue);
    const reason = this.classifyConsumeAllFailure(refreshed) ?? "not_found";
    return { ok: false, reason };
  }
}
