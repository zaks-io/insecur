import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  ONBOARDING_ERROR_CODES,
  organizationId,
  RECOVERY_CANARY_ORGANIZATION_ID,
  teamId,
  userId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import {
  createOperatorOrganization,
  isInstanceOperator,
  loadInstanceAnchorOrganizationId,
} from "../src/index.js";
import {
  cleanupMembershipManagementFixture,
  describeMembershipIntegration,
  INVITEE_USER_ID,
  OPERATOR_ORG_ID,
  OPERATOR_TEAM_ID,
  ORG_A,
  resetInvitationAcceptanceFixture,
  seedMembershipManagementFixture,
} from "./membership-management.integration-fixture.js";

describeMembershipIntegration(
  "membership management operator organization creation (PDF-02)",
  () => {
    beforeAll(seedMembershipManagementFixture);
    beforeEach(resetInvitationAcceptanceFixture);
    afterAll(cleanupMembershipManagementFixture);

    it("creates organizations only for instance operators", async () => {
      const operator = userId.brand(TEST_USER_ID);
      expect(await isInstanceOperator(TEST_INSTANCE_ID, operator)).toBe(true);

      await expect(
        createOperatorOrganization({
          instanceId: TEST_INSTANCE_ID,
          operatorUserId: userId.brand(INVITEE_USER_ID),
        }),
      ).rejects.toMatchObject({
        code: ONBOARDING_ERROR_CODES.notInstanceOperator,
      });

      const operatorDeniedAudit = await withTenantScope(
        { kind: "organization", organizationId: ORG_A },
        async ({ sql }) => {
          return await sql<
            {
              event_code: string;
              outcome: string;
              result_code: string;
              actor_user_id: string | null;
            }[]
          >`
          SELECT event_code, outcome, result_code, actor_user_id
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationDenied}
            AND actor_user_id = ${INVITEE_USER_ID}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        },
      );
      expect(operatorDeniedAudit[0]).toMatchObject({
        event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationDenied,
        outcome: "denied",
        result_code: ONBOARDING_ERROR_CODES.notInstanceOperator,
        actor_user_id: INVITEE_USER_ID,
      });

      const created = await createOperatorOrganization({
        instanceId: TEST_INSTANCE_ID,
        operatorUserId: operator,
        resourceIds: {
          organizationId: organizationId.brand(OPERATOR_ORG_ID),
          defaultTeamId: teamId.brand(OPERATOR_TEAM_ID),
        },
      });

      expect(created.organizationId).toBe(OPERATOR_ORG_ID);
      expect(created.defaultTeamId).toBe(OPERATOR_TEAM_ID);
    });

    it("records operator organization audit events", async () => {
      const operatorOrg = organizationId.brand(OPERATOR_ORG_ID);

      const operatorAudit = await withTenantScope(
        { kind: "organization", organizationId: operatorOrg },
        async ({ sql }) => {
          return await sql<{ event_code: string }[]>`
          SELECT event_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationCreated}
        `;
        },
      );
      expect(operatorAudit.length).toBeGreaterThan(0);
    });

    it("anchors instance-level audits on the real org, never the recovery canary", async () => {
      // Adversarially force the ambiguous created_at ordering to favor the canary: make it strictly
      // the earliest org on the instance. The anchor must still resolve to the real org because it
      // excludes the canary by id, not by ordering luck. If this regressed, instance-level audits
      // (and the co-timestamped bootstrap anchor) would bind to the sentinel org.
      const setCanaryCreatedAt = async (createdAt: string) => {
        await withTenantScope(
          {
            kind: "organization",
            organizationId: organizationId.brand(RECOVERY_CANARY_ORGANIZATION_ID),
          },
          async ({ sql }) => {
            await sql`
              UPDATE organizations SET created_at = ${createdAt} WHERE id = ${RECOVERY_CANARY_ORGANIZATION_ID}
            `;
          },
        );
      };

      await setCanaryCreatedAt("2000-01-01T00:00:00.000Z");
      try {
        const anchor = await loadInstanceAnchorOrganizationId(TEST_INSTANCE_ID);
        expect(anchor).toBe(TEST_ORG_A_ID);
        expect(anchor).not.toBe(RECOVERY_CANARY_ORGANIZATION_ID);
      } finally {
        // Restore so concurrent/subsequent suites on the shared baseline see the real shape.
        await setCanaryCreatedAt(new Date().toISOString());
      }
    });
  },
);
