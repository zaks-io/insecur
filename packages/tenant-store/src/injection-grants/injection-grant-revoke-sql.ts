import type { InjectionGrantId, OrganizationId, SecretVersionId } from "@insecur/domain";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { injectionGrants } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { INJECTION_GRANT_REVOCATION_REASONS } from "./types.js";

function activeInjectionGrantOrgWhere(organizationId: OrganizationId) {
  return and(
    eq(injectionGrants.orgId, organizationId),
    isNull(injectionGrants.consumedAt),
    isNull(injectionGrants.revokedAt),
    gt(injectionGrants.expiresAt, sql`now()`),
  );
}

export async function revokeActiveInjectionGrantsForOrganization(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    reason: typeof INJECTION_GRANT_REVOCATION_REASONS.tenantSuspension;
  },
): Promise<InjectionGrantId[]> {
  const rows = await db
    .update(injectionGrants)
    .set({
      revokedAt: sql`now()`,
      revokedReason: input.reason,
    })
    .where(activeInjectionGrantOrgWhere(input.organizationId))
    .returning({ id: injectionGrants.id });
  return rows.map((row) => row.id as InjectionGrantId);
}

export async function revokeActiveInjectionGrantsForSecretVersion(
  db: TenantScopedDb,
  input: {
    organizationId: OrganizationId;
    secretVersionId: SecretVersionId;
    reason: typeof INJECTION_GRANT_REVOCATION_REASONS.compromiseVersionInvalidation;
  },
): Promise<InjectionGrantId[]> {
  const rows = await db
    .update(injectionGrants)
    .set({
      revokedAt: sql`now()`,
      revokedReason: input.reason,
    })
    .where(
      and(
        activeInjectionGrantOrgWhere(input.organizationId),
        sql`${input.secretVersionId} = ANY (${injectionGrants.secretVersionIds})`,
      ),
    )
    .returning({ id: injectionGrants.id });
  return rows.map((row) => row.id as InjectionGrantId);
}
