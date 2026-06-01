import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import { recordAccessDenial } from "../src/index.js";
import { AUTH_ERROR_CODES, organizationId, requestId, userId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { requireDatabaseUrl } from "../../tenant-store/scripts/lib/env-local.mjs";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_ORG_A_ID, TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeIntegration = runtimeUrl ? describe : describe.skip;

interface AuditRow {
  event_code: string;
  outcome: string;
  result_code: string;
}

describeIntegration("recordAccessDenial (audit event writer)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("persists metadata-only access.denied audit events", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const request = requestId.brand("req_00000000000000000000000088");

    const result = await recordAccessDenial({
      actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
      organizationId: org,
      request: { requestId: request },
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(result.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);

    const rows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async (sql) => {
        return sql<AuditRow[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE id = ${result.auditEventId}
        `;
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
      outcome: "denied",
      result_code: AUTH_ERROR_CODES.insufficientScope,
    });
  });
});
