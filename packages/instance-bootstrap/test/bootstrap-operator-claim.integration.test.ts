import { randomBytes } from "node:crypto";
import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import * as bootstrapAudit from "../src/bootstrap-audit.js";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  BOOTSTRAP_ERROR_CODES,
  membershipId,
  organizationId,
  parseDisplayName,
  type DisplayName,
  teamId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  BootstrapError,
  completeBootstrapOperatorClaim,
  getBootstrapStatus,
  runInstanceBootstrap,
} from "../src/index.js";
import { cleanupBootstrapFixture } from "./cleanup-bootstrap-fixture.js";
import { testUserActor } from "./test-user-actor.js";

const BOOTSTRAP_INSTANCE_ID = "inst_BOOTSTRAP_CLAIM_TEST";
const BOOTSTRAP_ORG_ID = "org_00000000000000000000000077";
const BOOTSTRAP_TEAM_ID = "team_00000000000000000000000077";
const BOOTSTRAP_CLAIM_ID = "boc_00000000000000000000000001";
const BOOTSTRAP_OPERATOR_GRANT_ID = "iop_00000000000000000000000001";
const BOOTSTRAP_MEM_ID = "mem_00000000000000000000000077";
const CLAIM_USER_ID = "usr_00000000000000000000000077";
const OTHER_USER_ID = "usr_00000000000000000000000078";

const ROLLBACK_INSTANCE_ID = "inst_BOOTSTRAP_ROLLBACK_TEST";
const ROLLBACK_ORG_ID = "org_00000000000000000000000076";
const ROLLBACK_TEAM_ID = "team_00000000000000000000000076";
const ROLLBACK_CLAIM_ID = "boc_00000000000000000000000002";
const ROLLBACK_OPERATOR_GRANT_ID = "iop_00000000000000000000000002";
const ROLLBACK_MEM_ID = "mem_00000000000000000000000076";
const ROLLBACK_USER_ID = "usr_00000000000000000000000076";

const FK_INSTANCE_A = "inst_BOOTSTRAP_FK_TEST_A";
const FK_INSTANCE_B = "inst_BOOTSTRAP_FK_TEST_B";
const FK_ORG_A = "org_00000000000000000000000075";
const FK_ORG_B = "org_00000000000000000000000074";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

interface AuditRow {
  event_code: string;
  outcome: string;
}

interface ClaimRow {
  status: string;
}

async function loadClaimStatus(instanceId: string): Promise<string | null> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const rows = await sql<ClaimRow[]>`
      SELECT status FROM bootstrap_operator_claims WHERE instance_id = ${instanceId} LIMIT 1
    `;
    return rows[0]?.status ?? null;
  });
}

async function loadBootstrapGrantUserIds(
  instanceId: string,
  orgId: string,
): Promise<{ operatorUserIds: string[]; membershipUserIds: string[] }> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const operators = await sql<{ user_id: string }[]>`
      SELECT user_id FROM instance_operators WHERE instance_id = ${instanceId}
    `;
    const memberships = await sql<{ user_id: string }[]>`
      SELECT user_id FROM memberships WHERE org_id = ${orgId} AND project_id IS NULL
    `;
    return {
      operatorUserIds: operators.map((row) => row.user_id),
      membershipUserIds: memberships.map((row) => row.user_id),
    };
  });
}

describeIntegration("bootstrap operator claim", () => {
  let bootstrapSecret: string;

  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupBootstrapFixture(BOOTSTRAP_INSTANCE_ID);
    await cleanupBootstrapFixture(ROLLBACK_INSTANCE_ID);
    await cleanupBootstrapFixture(FK_INSTANCE_A);
    await cleanupBootstrapFixture(FK_INSTANCE_B);
    bootstrapSecret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: BOOTSTRAP_INSTANCE_ID,
      instanceDisplayName: testDisplayName("Bootstrap test instance"),
      organizationDisplayName: testDisplayName("Bootstrap test org"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(BOOTSTRAP_ORG_ID),
        defaultTeamId: teamId.brand(BOOTSTRAP_TEAM_ID),
        claimId: BOOTSTRAP_CLAIM_ID,
      },
      bootstrapSecret,
      workosClientId: "client_test_bootstrap",
    });
  });

  afterAll(async () => {
    await cleanupBootstrapFixture(BOOTSTRAP_INSTANCE_ID);
    await cleanupBootstrapFixture(ROLLBACK_INSTANCE_ID);
    await cleanupBootstrapFixture(FK_INSTANCE_A);
    await cleanupBootstrapFixture(FK_INSTANCE_B);
    await closeRuntimeSql();
  });

  it("reports awaiting_operator_claim before claim completion", async () => {
    const status = await getBootstrapStatus(BOOTSTRAP_INSTANCE_ID);
    expect(status).toEqual({
      phase: "awaiting_operator_claim",
      instanceId: BOOTSTRAP_INSTANCE_ID,
      organizationId: organizationId.brand(BOOTSTRAP_ORG_ID),
    });
  });

  it("rejects claim completion without an authenticated actor", async () => {
    await expect(
      completeBootstrapOperatorClaim({
        instanceId: BOOTSTRAP_INSTANCE_ID,
        actor: testUserActor(CLAIM_USER_ID, { sessionId: "" }),
        bootstrapSecret,
        operatorGrantId: BOOTSTRAP_OPERATOR_GRANT_ID,
        ownerMembershipId: membershipId.brand(BOOTSTRAP_MEM_ID),
      }),
    ).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.authenticatedActorRequired,
    });
  });

  it("denies claim completion with an invalid bootstrap secret", async () => {
    const wrongSecret = randomBytes(32).toString("base64url");

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: BOOTSTRAP_INSTANCE_ID,
        actor: testUserActor(CLAIM_USER_ID),
        bootstrapSecret: wrongSecret,
        operatorGrantId: BOOTSTRAP_OPERATOR_GRANT_ID,
        ownerMembershipId: membershipId.brand(BOOTSTRAP_MEM_ID),
      }),
    ).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.invalidSecret,
    });

    const operators = await withTenantScope({ kind: "service" }, async (sql) => {
      return await sql<{ user_id: string }[]>`
        SELECT user_id FROM instance_operators WHERE instance_id = ${BOOTSTRAP_INSTANCE_ID}
      `;
    });
    expect(operators).toEqual([]);
    expect(await loadClaimStatus(BOOTSTRAP_INSTANCE_ID)).toBe("pending");
  });

  it("completes the claim once and grants owner Effective Access", async () => {
    const claimActor = testUserActor(CLAIM_USER_ID);
    const org = organizationId.brand(BOOTSTRAP_ORG_ID);

    const result = await completeBootstrapOperatorClaim({
      instanceId: BOOTSTRAP_INSTANCE_ID,
      actor: claimActor,
      bootstrapSecret,
      operatorGrantId: BOOTSTRAP_OPERATOR_GRANT_ID,
      ownerMembershipId: membershipId.brand(BOOTSTRAP_MEM_ID),
    });

    expect(result.status.phase).toBe("complete");
    expect(result.organizationId).toBe(org);
    expect(result.status.operatorUserId).toBe(claimActor.userId);

    const grantUserIds = await loadBootstrapGrantUserIds(BOOTSTRAP_INSTANCE_ID, BOOTSTRAP_ORG_ID);
    expect(grantUserIds.operatorUserIds).toEqual([CLAIM_USER_ID]);
    expect(grantUserIds.membershipUserIds).toEqual([CLAIM_USER_ID]);

    const effectiveAccess = await resolveEffectiveAccess(
      { type: "user", userId: claimActor.userId },
      { organizationId: org },
    );
    for (const scope of FIRST_VALUE_OWNER_SCOPES) {
      expect(hasAuthorizationScope(effectiveAccess, scope)).toBe(true);
    }

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async (sql) => {
        return await sql<AuditRow[]>`
          SELECT event_code, outcome
          FROM audit_events
          WHERE org_id = ${org}
            AND event_code LIKE ${"bootstrap.%"}
          ORDER BY created_at ASC
        `;
      },
    );

    expect(auditRows).toEqual(
      expect.arrayContaining([
        {
          event_code: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapInstanceOperatorGranted,
          outcome: "success",
        },
        {
          event_code: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOwnerMembershipGranted,
          outcome: "success",
        },
      ]),
    );
  });

  it("denies duplicate claim attempts with bootstrap.already_claimed", async () => {
    const claimActor = testUserActor(CLAIM_USER_ID);

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: BOOTSTRAP_INSTANCE_ID,
        actor: testUserActor(OTHER_USER_ID),
        bootstrapSecret,
        operatorGrantId: "iop_00000000000000000000000003",
        ownerMembershipId: membershipId.brand("mem_00000000000000000000000079"),
      }),
    ).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.alreadyClaimed,
    });

    const status = await getBootstrapStatus(BOOTSTRAP_INSTANCE_ID);
    expect(status.phase).toBe("complete");
    if (status.phase === "complete") {
      expect(status.operatorUserId).toBe(claimActor.userId);
    }

    const grantUserIds = await loadBootstrapGrantUserIds(BOOTSTRAP_INSTANCE_ID, BOOTSTRAP_ORG_ID);
    expect(grantUserIds.operatorUserIds).toEqual([CLAIM_USER_ID]);
    expect(grantUserIds.membershipUserIds).toEqual([CLAIM_USER_ID]);
    expect(grantUserIds.operatorUserIds).not.toContain(OTHER_USER_ID);
    expect(grantUserIds.membershipUserIds).not.toContain(OTHER_USER_ID);
  });

  it("rolls back claim consumption when post-grant audit write fails", async () => {
    const rollbackSecret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: ROLLBACK_INSTANCE_ID,
      instanceDisplayName: testDisplayName("Rollback bootstrap instance"),
      organizationDisplayName: testDisplayName("Rollback bootstrap org"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(ROLLBACK_ORG_ID),
        defaultTeamId: teamId.brand(ROLLBACK_TEAM_ID),
        claimId: ROLLBACK_CLAIM_ID,
      },
      bootstrapSecret: rollbackSecret,
      workosClientId: "client_test_bootstrap",
    });

    const auditSpy = vi
      .spyOn(bootstrapAudit, "recordBootstrapSuccessAuditsInTransaction")

      .mockRejectedValue(new Error("simulated audit write failure"));

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: ROLLBACK_INSTANCE_ID,
        actor: testUserActor(ROLLBACK_USER_ID),
        bootstrapSecret: rollbackSecret,
        operatorGrantId: ROLLBACK_OPERATOR_GRANT_ID,
        ownerMembershipId: membershipId.brand(ROLLBACK_MEM_ID),
      }),
    ).rejects.toThrow("simulated audit write failure");

    auditSpy.mockRestore();

    expect(await loadClaimStatus(ROLLBACK_INSTANCE_ID)).toBe("pending");

    const operators = await withTenantScope({ kind: "service" }, async (sql) => {
      return await sql<{ id: string }[]>`
        SELECT id FROM instance_operators WHERE instance_id = ${ROLLBACK_INSTANCE_ID}
      `;
    });
    expect(operators).toEqual([]);
  });

  it("rejects bootstrap claims whose first organization is not on the same instance", async () => {
    const secret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: FK_INSTANCE_A,
      instanceDisplayName: testDisplayName("FK instance A"),
      organizationDisplayName: testDisplayName("FK org A"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(FK_ORG_A),
        defaultTeamId: teamId.brand("team_00000000000000000000000075"),
        claimId: "boc_00000000000000000000000003",
      },
      bootstrapSecret: secret,
      workosClientId: "client_test_bootstrap",
    });

    await withTenantScope({ kind: "service" }, async (sql) => {
      await sql`
        INSERT INTO instances (id, display_name)
        VALUES (${FK_INSTANCE_B}, ${"FK instance B"})
      `;
      await sql`
        INSERT INTO organizations (id, instance_id, display_name)
        VALUES (${FK_ORG_B}, ${FK_INSTANCE_B}, ${"FK org B"})
      `;
    });

    const mismatchedClaimId = "boc_00000000000000000000000004";
    await expect(
      withTenantScope({ kind: "service" }, async (sql) => {
        await sql`
          INSERT INTO bootstrap_operator_claims (
            id,
            instance_id,
            first_organization_id,
            status
          )
          VALUES (
            ${mismatchedClaimId},
            ${FK_INSTANCE_B},
            ${FK_ORG_A},
            ${"pending"}
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "23503" });

    const claimsOnInstanceB = await withTenantScope({ kind: "service" }, async (sql) => {
      return await sql<{ id: string }[]>`
        SELECT id FROM bootstrap_operator_claims WHERE instance_id = ${FK_INSTANCE_B}
      `;
    });
    expect(claimsOnInstanceB).toEqual([]);
  });
});

describe("BootstrapError", () => {
  it("exposes stable bootstrap error codes", () => {
    const error = new BootstrapError(BOOTSTRAP_ERROR_CODES.alreadyClaimed, "already claimed");
    expect(error.code).toBe("bootstrap.already_claimed");
  });
});
