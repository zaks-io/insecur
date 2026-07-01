import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  queryFirstValueUsageEvidenceInTenantScope,
} from "@insecur/audit";
import { organizationId, userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { TEST_ORG_A_ID, TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG = organizationId.brand(TEST_ORG_A_ID);
const USER = userId.brand(TEST_USER_ID);

describeIntegration("queryFirstValueUsageEvidence", () => {
  it("reports repeated run usage from metadata-only audit events", async () => {
    const window = {
      startInclusive: new Date("2020-01-01T00:00:00.000Z"),
      endExclusive: new Date("2099-01-01T00:00:00.000Z"),
    };

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
      for (let index = 0; index < 2; index += 1) {
        await sql`
          INSERT INTO audit_events (
            id,
            org_id,
            event_code,
            outcome,
            result_code,
            actor_type,
            actor_user_id,
            details,
            created_at
          ) VALUES (
            ${`aud_test_run_completed_${String(index)}`},
            ${ORG},
            ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted},
            ${"success"},
            ${"audit.succeeded"},
            ${"user"},
            ${USER},
            ${sql.json({ childExitCode: 0 })},
            NOW()
          )
        `;
      }

      const evidence = await queryFirstValueUsageEvidenceInTenantScope(sql, ORG, window);
      expect(evidence.counts.runCompleted).toBeGreaterThanOrEqual(2);
      expect(evidence.repeatedRunUsage).toBe(true);
      expect(JSON.stringify(evidence)).not.toMatch(/hunter2|secret-value/i);
    });
  });
});
