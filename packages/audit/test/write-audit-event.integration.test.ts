import { FIRST_VALUE_AUDIT_EVENT_CODES, writeAuditEvent } from "../src/index.js";
import {
  brandOpaqueResourceIdForPrefix,
  environmentId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

interface AuditRow {
  id: string;
  org_id: string;
  event_code: string;
  outcome: string;
  result_code: string;
  actor_type: string;
  actor_user_id: string | null;
  project_id: string | null;
  environment_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  request_id: string | null;
  operation_id: string | null;
}

describeIntegration("writeAuditEvent (tenant-scoped store)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("persists organization-qualified metadata-only rows", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const request = requestId.brand("req_00000000000000000000000099");

    const result = await writeAuditEvent({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
      organizationId: org,
      projectId: projectId.brand(TEST_PROJECT_A_ID),
      environmentId: environmentId.brand(TEST_ENV_A_ID),
      resource: {
        type: "organization",
        id: brandOpaqueResourceIdForPrefix("org", TEST_ORG_A_ID),
      },
      request: { requestId: request },
    });

    expect(result.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);

    const rows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async (sql) => {
        return await sql<AuditRow[]>`
        SELECT
          id,
          org_id,
          event_code,
          outcome,
          result_code,
          actor_type,
          actor_user_id,
          project_id,
          environment_id,
          resource_type,
          resource_id,
          request_id,
          operation_id
        FROM audit_events
        WHERE id = ${result.auditEventId}
      `;
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.auditEventId,
      org_id: TEST_ORG_A_ID,
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      result_code: "audit.succeeded",
      actor_type: "user",
      actor_user_id: TEST_USER_ID,
      project_id: TEST_PROJECT_A_ID,
      environment_id: TEST_ENV_A_ID,
      resource_type: "organization",
      resource_id: TEST_ORG_A_ID,
      request_id: "req_00000000000000000000000099",
      operation_id: null,
    });
  });

  it("stores stable denial result codes for denied attempts", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);

    const result = await writeAuditEvent({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
      outcome: "denied",
      actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
      organizationId: org,
      denial: { reasonCode: "auth.insufficient_scope" },
    });

    const rows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async (sql) => {
        return await sql<Pick<AuditRow, "outcome" | "result_code" | "event_code">[]>`
        SELECT outcome, result_code, event_code
        FROM audit_events
        WHERE id = ${result.auditEventId}
      `;
      },
    );

    expect(rows[0]).toEqual({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
      outcome: "denied",
      result_code: "auth.insufficient_scope",
    });
  });
});
