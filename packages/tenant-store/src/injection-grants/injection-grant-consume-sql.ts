import type { InjectionGrantId, OrganizationId, SecretId, VariableKey } from "@insecur/domain";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { injectionGrants } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { ConsumedInjectionGrantRow, InjectionGrantRow } from "./types.js";

export const injectionGrantRowSelection = {
  id: injectionGrants.id,
  org_id: injectionGrants.orgId,
  project_id: injectionGrants.projectId,
  environment_id: injectionGrants.environmentId,
  variable_keys: injectionGrants.variableKeys,
  secret_ids: injectionGrants.secretIds,
  secret_version_ids: injectionGrants.secretVersionIds,
  policy_id: injectionGrants.policyId,
  policy_version_id: injectionGrants.policyVersionId,
  expires_at: injectionGrants.expiresAt,
  consumed_at: injectionGrants.consumedAt,
} as const;

function activeInjectionGrantWhere(organizationId: OrganizationId, grantId: InjectionGrantId) {
  return and(
    eq(injectionGrants.id, grantId),
    eq(injectionGrants.orgId, organizationId),
    isNull(injectionGrants.consumedAt),
    gt(injectionGrants.expiresAt, sql`now()`),
  );
}

export async function performConsumeUpdate(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    grantId: InjectionGrantId;
    bound: ConsumedInjectionGrantRow;
    requestedSecretId: SecretId;
    requestedVariableKey: VariableKey;
  },
): Promise<InjectionGrantRow | null> {
  const rows = await db
    .update(injectionGrants)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        activeInjectionGrantWhere(input.organizationId, input.grantId),
        isNull(injectionGrants.policyId),
        sql`cardinality(${injectionGrants.secretIds}) = 1`,
        sql`cardinality(${injectionGrants.variableKeys}) = 1`,
        sql`cardinality(${injectionGrants.secretVersionIds}) = 1`,
        sql`${input.bound.secretVersionId} = ANY (${injectionGrants.secretVersionIds})`,
        sql`${input.requestedSecretId} = ANY (${injectionGrants.secretIds})`,
        sql`${input.requestedVariableKey} = ANY (${injectionGrants.variableKeys})`,
      ),
    )
    .returning(injectionGrantRowSelection);
  return rows[0] ?? null;
}

export async function performConsumeAllUpdate(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    grantId: InjectionGrantId;
  },
): Promise<InjectionGrantRow | null> {
  const rows = await db
    .update(injectionGrants)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        activeInjectionGrantWhere(input.organizationId, input.grantId),
        sql`${injectionGrants.policyId} IS NOT NULL`,
        sql`cardinality(${injectionGrants.secretIds}) = cardinality(${injectionGrants.variableKeys})`,
        sql`cardinality(${injectionGrants.secretIds}) = cardinality(${injectionGrants.secretVersionIds})`,
        sql`cardinality(${injectionGrants.secretIds}) > 0`,
      ),
    )
    .returning(injectionGrantRowSelection);
  return rows[0] ?? null;
}
