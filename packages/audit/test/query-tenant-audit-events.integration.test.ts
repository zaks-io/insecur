import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  queryTenantAuditEvents,
  queryTenantAuditEventsInTenantScope,
  writeAuditEvent,
} from "@insecur/audit";
import {
  assertMetadataOnlyValue,
  auditEventId,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bindJsonb, closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const ORG_B = organizationId.brand(TEST_ORG_B_ID);
const USER = userId.brand(TEST_USER_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const ENV = environmentId.brand(TEST_ENV_A_ID);

async function insertAuditEvent(input: {
  readonly id: string;
  readonly orgId: typeof ORG_A;
  readonly eventCode: string;
  readonly createdAt: string;
  readonly actorUserId?: typeof USER;
  readonly projectId?: typeof PROJECT;
  readonly environmentId?: typeof ENV;
  readonly details?: Record<string, string | number | boolean | null>;
}) {
  await withTenantScope({ kind: "organization", organizationId: input.orgId }, async ({ sql }) => {
    await sql`
      INSERT INTO audit_events (
        id,
        org_id,
        event_code,
        outcome,
        result_code,
        actor_type,
        actor_user_id,
        project_id,
        environment_id,
        details,
        created_at
      ) VALUES (
        ${input.id},
        ${input.orgId},
        ${input.eventCode},
        ${"success"},
        ${"audit.succeeded"},
        ${"user"},
        ${input.actorUserId ?? USER},
        ${input.projectId ?? null},
        ${input.environmentId ?? null},
        ${input.details === undefined ? null : bindJsonb(sql, input.details)},
        ${input.createdAt}::timestamptz
      )
    `;
  });
}

describeIntegration("queryTenantAuditEvents", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("filters by actor, project, environment, event code, and time range", async () => {
    const matchingId = auditEventId.generate();
    const otherId = auditEventId.generate();

    await insertAuditEvent({
      id: matchingId,
      orgId: ORG_A,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      createdAt: "2026-07-01T10:00:00.000Z",
      projectId: PROJECT,
      environmentId: ENV,
      details: {
        agentSessionId: "ags_00000000000000000000000011",
        harnessName: "agent.harness.claude_code",
      },
    });
    await insertAuditEvent({
      id: otherId,
      orgId: ORG_A,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
      createdAt: "2026-06-01T10:00:00.000Z",
    });

    const page = await queryTenantAuditEvents({
      organizationId: ORG_A,
      filters: {
        actorUserId: USER,
        projectId: PROJECT,
        environmentId: ENV,
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        createdAtFrom: "2026-07-01T00:00:00.000Z",
        createdAtTo: "2026-07-02T00:00:00.000Z",
      },
      pageSize: 10,
    });

    expect(page.events.some((event) => event.auditEventId === matchingId)).toBe(true);
    expect(page.events.some((event) => event.auditEventId === otherId)).toBe(false);
    const matched = page.events.find((event) => event.auditEventId === matchingId);
    expect(matched?.actor).toMatchObject({ actorType: "user", userId: USER });
    expect(matched?.details).toMatchObject({
      agentSessionId: "ags_00000000000000000000000011",
      harnessName: "agent.harness.claude_code",
    });
    assertMetadataOnlyValue(page);
    expect(JSON.stringify(page)).not.toMatch(/hunter2|secret-value/i);
  });

  it("paginates stably in reverse chronological order", async () => {
    const olderId = auditEventId.generate();
    const newerId = auditEventId.generate();

    await insertAuditEvent({
      id: olderId,
      orgId: ORG_A,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
      createdAt: "2026-07-02T10:00:00.000Z",
    });
    await insertAuditEvent({
      id: newerId,
      orgId: ORG_A,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
      createdAt: "2026-07-03T10:00:00.000Z",
    });

    const paginationFilters = {
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
      createdAtFrom: "2026-07-02T00:00:00.000Z",
      createdAtTo: "2026-07-04T00:00:00.000Z",
    };

    const firstPage = await queryTenantAuditEvents({
      organizationId: ORG_A,
      filters: paginationFilters,
      pageSize: 1,
    });

    expect(firstPage.events).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await queryTenantAuditEvents({
      organizationId: ORG_A,
      filters: paginationFilters,
      pageSize: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });

    const ids = [firstPage.events[0]?.auditEventId, secondPage.events[0]?.auditEventId];
    expect(ids).toContain(newerId);
    expect(ids).toContain(olderId);
    expect(firstPage.events[0]?.auditEventId).not.toBe(secondPage.events[0]?.auditEventId);
  });

  it("returns no cross-tenant rows under forced RLS", async () => {
    const orgBEventId = auditEventId.generate();

    await insertAuditEvent({
      id: orgBEventId,
      orgId: ORG_B,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted,
      createdAt: "2026-07-04T10:00:00.000Z",
    });

    const orgAPage = await queryTenantAuditEvents({ organizationId: ORG_A, pageSize: 100 });
    expect(orgAPage.events.some((event) => event.auditEventId === orgBEventId)).toBe(false);

    const scopedPage = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      ({ sql }) =>
        queryTenantAuditEventsInTenantScope(sql, {
          organizationId: ORG_A,
          filters: { eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted },
        }),
    );
    expect(scopedPage.events.some((event) => event.auditEventId === orgBEventId)).toBe(false);
  });

  it("persists and reads metadata-only events through writeAuditEvent", async () => {
    const result = await writeAuditEvent({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG_A,
      projectId: PROJECT,
      environmentId: ENV,
    });

    const page = await queryTenantAuditEvents({
      organizationId: ORG_A,
      filters: { eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned },
      pageSize: 5,
    });

    expect(page.events.some((event) => event.auditEventId === result.auditEventId)).toBe(true);
  });
});
