import {
  environmentId,
  invitationId,
  membershipId,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_INSTANCE_ID } from "../../tenant-store/test/rls/test-ids.js";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordActionAuditInTenantScope: vi.fn(actual.recordActionAuditInTenantScope),
    writeAuditEventInTenantScope: vi.fn(actual.writeAuditEventInTenantScope),
  };
});

import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordActionAuditInTenantScope,
  writeAuditEventInTenantScope,
} from "@insecur/audit";
import {
  acceptInvitation,
  createInvitation,
  createOperatorOrganization,
  provisionGuidedOrganization,
} from "../src/index.js";
import { cleanupMembershipFixture } from "./cleanup-membership-fixture.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const actionAuditInScopeMock = vi.mocked(recordActionAuditInTenantScope);
const writeAuditInScopeMock = vi.mocked(writeAuditEventInTenantScope);

// Per-run ids so concurrent suites on the shared local Postgres never collide.
const GUIDED_IDS = {
  organizationId: organizationId.generate(),
  defaultTeamId: teamId.generate(),
  ownerMembershipId: membershipId.generate(),
  projectId: projectId.generate(),
  developmentEnvironmentId: environmentId.generate(),
};
const GUIDED_OWNER = userId.generate();
const INVITEE = userId.generate();
const INVITATION = invitationId.generate();
const GRANTED_MEMBERSHIP = membershipId.generate();
const OPERATOR = userId.generate();
const OPERATOR_GRANT_ID = `iop_${crypto.randomUUID().replaceAll("-", "").slice(0, 26)}`;
const OPERATOR_IDS = {
  organizationId: organizationId.generate(),
  defaultTeamId: teamId.generate(),
};

const GUIDED_ORG_SCOPE = {
  kind: "organization",
  organizationId: GUIDED_IDS.organizationId,
} as const;

async function countRows(query: {
  table: "organizations" | "memberships" | "invitations";
  id: string;
}): Promise<number> {
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n FROM ${sql(query.table)} WHERE id = ${query.id}
    `;
    return Number(rows[0]?.n ?? "0");
  });
}

async function countSuccessAudits(orgId: string, eventCode: string): Promise<number> {
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = await sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n
      FROM audit_events
      WHERE org_id = ${orgId}
        AND event_code = ${eventCode}
        AND outcome = ${"success"}
    `;
    return Number(rows[0]?.n ?? "0");
  });
}

describeIntegration("onboarding authority changes and success audit atomicity (INS-581)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await withTenantScope({ kind: "service" }, async ({ sql }) => {
      await sql`
        INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
        VALUES (${OPERATOR_GRANT_ID}, ${TEST_INSTANCE_ID}, ${OPERATOR}, ${"admin"})
      `;
    });
  });

  afterAll(async () => {
    await cleanupMembershipFixture(GUIDED_IDS.organizationId);
    await cleanupMembershipFixture(OPERATOR_IDS.organizationId);
    await withTenantScope({ kind: "service" }, async ({ sql }) => {
      await sql`DELETE FROM instance_operators WHERE id = ${OPERATOR_GRANT_ID}`;
    });
    await closeRuntimeSql();
  });

  it("rolls back guided provisioning when the success audit fails, and a retry provisions exactly once", async () => {
    writeAuditInScopeMock.mockRejectedValueOnce(new Error("injected audit failure"));

    await expect(
      provisionGuidedOrganization({
        userId: GUIDED_OWNER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
        resourceIds: GUIDED_IDS,
      }),
    ).rejects.toThrow("injected audit failure");

    expect(await countRows({ table: "organizations", id: GUIDED_IDS.organizationId })).toBe(0);
    expect(await countRows({ table: "memberships", id: GUIDED_IDS.ownerMembershipId })).toBe(0);

    const retried = await provisionGuidedOrganization({
      userId: GUIDED_OWNER,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
      resourceIds: GUIDED_IDS,
    });

    expect(retried.organizationId).toBe(GUIDED_IDS.organizationId);
    expect(await countRows({ table: "memberships", id: GUIDED_IDS.ownerMembershipId })).toBe(1);
    expect(
      await countSuccessAudits(
        GUIDED_IDS.organizationId,
        FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      ),
    ).toBe(1);
  });

  it("rolls back invitation creation when the success audit fails, and a retry creates exactly once", async () => {
    const input = {
      actor: { type: "user" as const, userId: GUIDED_OWNER },
      organizationId: GUIDED_IDS.organizationId,
      inviteeUserId: INVITEE,
      rolePreset: "developer",
      invitationId: INVITATION,
    };

    actionAuditInScopeMock.mockRejectedValueOnce(new Error("injected audit failure"));

    await expect(createInvitation(input)).rejects.toThrow("injected audit failure");

    expect(await countRows({ table: "invitations", id: INVITATION })).toBe(0);
    expect(
      await countSuccessAudits(
        GUIDED_IDS.organizationId,
        FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
      ),
    ).toBe(0);

    const retried = await createInvitation(input);

    expect(retried.invitationId).toBe(INVITATION);
    expect(await countRows({ table: "invitations", id: INVITATION })).toBe(1);
    expect(
      await countSuccessAudits(
        GUIDED_IDS.organizationId,
        FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
      ),
    ).toBe(1);
  });

  it("rolls back invitation acceptance when the success audit fails, and a retry grants exactly one membership", async () => {
    const input = {
      invitationId: INVITATION,
      organizationId: GUIDED_IDS.organizationId,
      acceptingUserId: INVITEE,
      membershipId: GRANTED_MEMBERSHIP,
    };

    actionAuditInScopeMock.mockRejectedValueOnce(new Error("injected audit failure"));

    await expect(acceptInvitation(input)).rejects.toThrow("injected audit failure");

    expect(await countRows({ table: "memberships", id: GRANTED_MEMBERSHIP })).toBe(0);
    const pendingAfterFailure = await withTenantScope(GUIDED_ORG_SCOPE, async ({ sql }) => {
      return await sql<{ status: string }[]>`
        SELECT status FROM invitations WHERE id = ${INVITATION}
      `;
    });
    expect(pendingAfterFailure[0]?.status).toBe("pending");

    const retried = await acceptInvitation(input);

    expect(retried.membershipId).toBe(GRANTED_MEMBERSHIP);
    expect(await countRows({ table: "memberships", id: GRANTED_MEMBERSHIP })).toBe(1);
    expect(
      await countSuccessAudits(
        GUIDED_IDS.organizationId,
        FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
      ),
    ).toBe(1);
  });

  it("rolls back operator organization creation when the success audit fails, and a retry creates exactly once", async () => {
    const input = {
      instanceId: TEST_INSTANCE_ID,
      operatorUserId: OPERATOR,
      resourceIds: OPERATOR_IDS,
    };

    actionAuditInScopeMock.mockRejectedValueOnce(new Error("injected audit failure"));

    await expect(createOperatorOrganization(input)).rejects.toThrow("injected audit failure");

    expect(await countRows({ table: "organizations", id: OPERATOR_IDS.organizationId })).toBe(0);

    const retried = await createOperatorOrganization(input);

    expect(retried.organizationId).toBe(OPERATOR_IDS.organizationId);
    expect(await countRows({ table: "organizations", id: OPERATOR_IDS.organizationId })).toBe(1);
    expect(
      await countSuccessAudits(
        OPERATOR_IDS.organizationId,
        FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationCreated,
      ),
    ).toBe(1);
  });
});
