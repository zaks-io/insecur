import { FIRST_VALUE_AUDIT_EVENT_CODES } from "./audit-event-codes.js";
import type { OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { withTenantScope } from "@insecur/tenant-store";

export interface FirstValueUsageWindow {
  readonly startInclusive: Date;
  readonly endExclusive: Date;
}

export interface FirstValueUsageEventCounts {
  readonly guidedProvisioned: number;
  readonly secretWrites: number;
  readonly grantIssued: number;
  readonly grantConsumed: number;
  readonly runCompleted: number;
  readonly deniedAttempts: number;
}

export interface FirstValueUsageEvidence {
  readonly organizationId: OrganizationId;
  readonly window: FirstValueUsageWindow;
  readonly counts: FirstValueUsageEventCounts;
  readonly distinctRunActors: number;
  readonly repeatedRunUsage: boolean;
}

const DENIED_FIRST_VALUE_EVENT_CODES = [
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
] as const;

async function countAuditEvents(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
  eventCode: string,
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM audit_events
    WHERE org_id = ${organizationId}
      AND event_code = ${eventCode}
      AND created_at >= ${window.startInclusive}
      AND created_at < ${window.endExclusive}
  `;
  return Number(rows[0]?.count ?? "0");
}

async function countDeniedAttempts(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM audit_events
    WHERE org_id = ${organizationId}
      AND event_code = ANY(${DENIED_FIRST_VALUE_EVENT_CODES})
      AND created_at >= ${window.startInclusive}
      AND created_at < ${window.endExclusive}
  `;
  return Number(rows[0]?.count ?? "0");
}

async function countDistinctRunActors(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(DISTINCT actor_user_id)::text AS count
    FROM audit_events
    WHERE org_id = ${organizationId}
      AND event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted}
      AND actor_user_id IS NOT NULL
      AND created_at >= ${window.startInclusive}
      AND created_at < ${window.endExclusive}
  `;
  return Number(rows[0]?.count ?? "0");
}

/**
 * Aggregates metadata-only First Value audit evidence for design-partner validation windows.
 */
export async function queryFirstValueUsageEvidence(
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
): Promise<FirstValueUsageEvidence> {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) =>
    queryFirstValueUsageEvidenceInTenantScope(sql, organizationId, window),
  );
}

const FIRST_VALUE_COUNTED_EVENT_CODES = {
  guidedProvisioned: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
  secretWrites: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
  grantIssued: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
  grantConsumed: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed,
  runCompleted: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
} as const;

type CountedEventKey = keyof typeof FIRST_VALUE_COUNTED_EVENT_CODES;

async function countEventsByCodeMap(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
): Promise<Record<CountedEventKey, number>> {
  const entries = await Promise.all(
    (Object.keys(FIRST_VALUE_COUNTED_EVENT_CODES) as CountedEventKey[]).map(async (key) => {
      const count = await countAuditEvents(
        sql,
        organizationId,
        window,
        FIRST_VALUE_COUNTED_EVENT_CODES[key],
      );
      return [key, count] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<CountedEventKey, number>;
}

async function countFirstValueUsageEvents(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
): Promise<FirstValueUsageEventCounts & { distinctRunActors: number }> {
  const [eventCounts, deniedAttempts, distinctRunActors] = await Promise.all([
    countEventsByCodeMap(sql, organizationId, window),
    countDeniedAttempts(sql, organizationId, window),
    countDistinctRunActors(sql, organizationId, window),
  ]);

  return { ...eventCounts, deniedAttempts, distinctRunActors };
}

export async function queryFirstValueUsageEvidenceInTenantScope(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  window: FirstValueUsageWindow,
): Promise<FirstValueUsageEvidence> {
  const usage = await countFirstValueUsageEvents(sql, organizationId, window);
  const { distinctRunActors, ...counts } = usage;

  return {
    organizationId,
    window,
    counts,
    distinctRunActors,
    repeatedRunUsage: counts.runCompleted >= 2,
  };
}
