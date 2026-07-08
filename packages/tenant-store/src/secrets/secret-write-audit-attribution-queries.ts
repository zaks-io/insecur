import { and, desc, eq, inArray } from "drizzle-orm";

import { auditEvents } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { principalChainActorFromAuditRow } from "./principal-chain-actor-from-audit.js";
import type { PrincipalChainActorRow } from "./principal-chain-actor-types.js";

const SECRET_WRITE_EVENT_CODES = [
  "secret.non_protected_write",
  "secret.protected_draft_write",
] as const;

const principalChainAuditSelect = {
  actorType: auditEvents.actorType,
  actorUserId: auditEvents.actorUserId,
  actorMachineIdentityId: auditEvents.actorMachineIdentityId,
  details: auditEvents.details,
  createdAt: auditEvents.createdAt,
} as const;

export interface PrincipalChainAuditAttributionRow {
  readonly setAt: Date;
  readonly setActor: PrincipalChainActorRow;
}

function loadLatestPrincipalChainAttribution(
  rows: readonly ({
    readonly resourceKey: string | null;
  } & Parameters<typeof principalChainActorFromAuditRow>[0] & {
      readonly createdAt: Date;
    })[],
): Map<string, PrincipalChainAuditAttributionRow> {
  const attributionByResourceKey = new Map<string, PrincipalChainAuditAttributionRow>();
  for (const row of rows) {
    if (!row.resourceKey || attributionByResourceKey.has(row.resourceKey)) {
      continue;
    }
    const setActor = principalChainActorFromAuditRow(row);
    if (!setActor) {
      continue;
    }
    attributionByResourceKey.set(row.resourceKey, {
      setAt: row.createdAt,
      setActor,
    });
  }
  return attributionByResourceKey;
}

/** Latest successful secret-write attribution keyed by secret resource id. */
export async function loadSecretLastSetAttributionBySecretId(
  db: TenantScopedDb,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly secretIds: readonly string[];
  },
): Promise<Map<string, PrincipalChainAuditAttributionRow>> {
  if (input.secretIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      resourceKey: auditEvents.resourceId,
      ...principalChainAuditSelect,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.orgId, input.organizationId),
        eq(auditEvents.projectId, input.projectId),
        eq(auditEvents.resourceType, "secret"),
        eq(auditEvents.outcome, "success"),
        inArray(auditEvents.resourceId, [...input.secretIds]),
        inArray(auditEvents.eventCode, [...SECRET_WRITE_EVENT_CODES]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt));

  return loadLatestPrincipalChainAttribution(rows);
}

/** Latest successful secret-write attribution keyed by secret version resource id. */
export async function loadSecretVersionSetAttributionByVersionId(
  db: TenantScopedDb,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly secretVersionIds: readonly string[];
  },
): Promise<Map<string, PrincipalChainAuditAttributionRow>> {
  if (input.secretVersionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      resourceKey: auditEvents.relatedResourceId,
      ...principalChainAuditSelect,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.orgId, input.organizationId),
        eq(auditEvents.projectId, input.projectId),
        eq(auditEvents.environmentId, input.environmentId),
        eq(auditEvents.relatedResourceType, "secret_version"),
        eq(auditEvents.outcome, "success"),
        inArray(auditEvents.relatedResourceId, [...input.secretVersionIds]),
        inArray(auditEvents.eventCode, [...SECRET_WRITE_EVENT_CODES]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt));

  return loadLatestPrincipalChainAttribution(rows);
}
