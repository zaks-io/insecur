import { randomBytes } from "node:crypto";
import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import * as assertOwnerEffectiveAccess from "../src/assert-owner-effective-access-in-transaction.js";
import * as bootstrapAudit from "../src/bootstrap-audit.js";
import { executeBootstrapClaimInTransaction } from "../src/execute-bootstrap-claim-in-transaction.js";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  BOOTSTRAP_ERROR_CODES,
  membershipId,
  organizationId,
  parseDisplayName,
  type DisplayName,
  teamId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  closeRuntimeSql,
  resolveAdmittedUserId,
  seedActiveUserAdmission,
  withTenantScope,
} from "@insecur/tenant-store";
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
const ROLLBACK_MEM_ID = "mem_00000000000000000000000096";
const ROLLBACK_USER_ID = "usr_00000000000000000000000076";

const ASSERTION_ROLLBACK_INSTANCE_ID = "inst_BOOTSTRAP_ASSERT_ROLLBACK";
const ASSERTION_ROLLBACK_ORG_ID = "org_00000000000000000000000073";
const ASSERTION_ROLLBACK_TEAM_ID = "team_00000000000000000000000073";
const ASSERTION_ROLLBACK_CLAIM_ID = "boc_00000000000000000000000005";
const ASSERTION_ROLLBACK_OPERATOR_GRANT_ID = "iop_00000000000000000000000005";
const ASSERTION_ROLLBACK_MEM_ID = "mem_00000000000000000000000073";
const ASSERTION_ROLLBACK_USER_ID = "usr_00000000000000000000000073";

const FK_INSTANCE_A = "inst_BOOTSTRAP_FK_TEST_A";
const FK_INSTANCE_B = "inst_BOOTSTRAP_FK_TEST_B";
const FK_ORG_A = "org_00000000000000000000000075";
const FK_ORG_B = "org_00000000000000000000000074";

const DENIAL_AUDIT_INSTANCE_ID = "inst_BOOTSTRAP_DENIAL_AUDIT_TEST";
const DENIAL_AUDIT_ORG_ID = "org_00000000000000000000000072";
const DENIAL_AUDIT_TEAM_ID = "team_00000000000000000000000072";
const DENIAL_AUDIT_CLAIM_ID = "boc_00000000000000000000000006";
const DENIAL_AUDIT_OPERATOR_GRANT_ID = "iop_00000000000000000000000006";
const DENIAL_AUDIT_MEM_ID = "mem_00000000000000000000000072";
const DENIAL_AUDIT_USER_ID = "usr_00000000000000000000000072";
const DENIAL_AUDIT_OTHER_USER_ID = "usr_00000000000000000000000071";

const PREADMITTED_INSTANCE_ID = "inst_BOOTSTRAP_PREADMITTED_TEST";
const PREADMITTED_ORG_ID = "org_00000000000000000000000065";
const PREADMITTED_TEAM_ID = "team_00000000000000000000000065";
const PREADMITTED_CLAIM_ID = "boc_00000000000000000000000008";
const PREADMITTED_OPERATOR_GRANT_ID = "iop_00000000000000000000000009";
const PREADMITTED_MEM_ID = "mem_00000000000000000000000065";
const PREADMITTED_USER_ID = "usr_00000000000000000000000065";
const PREADMITTED_EXISTING_USER_ID = "usr_00000000000000000000000064";
const PREADMITTED_WORKOS_USER_ID = "workos_user_preadmitted_test";
const PREADMITTED_ADMISSION_ID = "uad_00000000000000000000000065";

const DENIAL_AUDIT_ROLLBACK_INSTANCE_ID = "inst_BOOTSTRAP_DENIAL_AUDIT_ROLLBACK";
const DENIAL_AUDIT_ROLLBACK_ORG_ID = "org_00000000000000000000000071";
const DENIAL_AUDIT_ROLLBACK_TEAM_ID = "team_00000000000000000000000071";
const DENIAL_AUDIT_ROLLBACK_CLAIM_ID = "boc_00000000000000000000000007";
const DENIAL_AUDIT_ROLLBACK_OPERATOR_GRANT_ID = "iop_00000000000000000000000007";
const DENIAL_AUDIT_ROLLBACK_MEM_ID = "mem_00000000000000000000000071";
const DENIAL_AUDIT_ROLLBACK_USER_ID = "usr_00000000000000000000000070";

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
  result_code: string;
}

interface ClaimRow {
  status: string;
}

async function loadClaimStatus(instanceId: string): Promise<string | null> {
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = await sql<ClaimRow[]>`
      SELECT status FROM bootstrap_operator_claims WHERE instance_id = ${instanceId} LIMIT 1
    `;
    return rows[0]?.status ?? null;
  });
}

async function loadBootstrapDenialAuditRows(orgId: string): Promise<AuditRow[]> {
  return withTenantScope(
    { kind: "organization", organizationId: organizationId.brand(orgId) },
    async ({ sql }) => {
      return await sql<AuditRow[]>`
        SELECT event_code, outcome, result_code
        FROM audit_events
        WHERE org_id = ${orgId}
          AND event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied}
        ORDER BY created_at ASC
      `;
    },
  );
}

async function loadBootstrapGrantUserIds(
  instanceId: string,
  orgId: string,
): Promise<{ operatorUserIds: string[]; membershipUserIds: string[] }> {
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
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
    await cleanupBootstrapFixture(ASSERTION_ROLLBACK_INSTANCE_ID);
    await cleanupBootstrapFixture(FK_INSTANCE_A);
    await cleanupBootstrapFixture(FK_INSTANCE_B);
    await cleanupBootstrapFixture(DENIAL_AUDIT_INSTANCE_ID);
    await cleanupBootstrapFixture(DENIAL_AUDIT_ROLLBACK_INSTANCE_ID);
    await cleanupBootstrapFixture(PREADMITTED_INSTANCE_ID);
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
    await cleanupBootstrapFixture(ASSERTION_ROLLBACK_INSTANCE_ID);
    await cleanupBootstrapFixture(FK_INSTANCE_A);
    await cleanupBootstrapFixture(FK_INSTANCE_B);
    await cleanupBootstrapFixture(DENIAL_AUDIT_INSTANCE_ID);
    await cleanupBootstrapFixture(DENIAL_AUDIT_ROLLBACK_INSTANCE_ID);
    await cleanupBootstrapFixture(PREADMITTED_INSTANCE_ID);
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

    const operators = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ user_id: string }[]>`
        SELECT user_id FROM instance_operators WHERE instance_id = ${BOOTSTRAP_INSTANCE_ID}
      `;
    });
    expect(operators).toEqual([]);
    expect(await loadClaimStatus(BOOTSTRAP_INSTANCE_ID)).toBe("pending");
    expect(
      await resolveAdmittedUserId(BOOTSTRAP_INSTANCE_ID, testUserActor(CLAIM_USER_ID).workosUserId),
    ).toBeNull();
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

    // The exact resolution login performs (INS-180): the claimed operator must be admitted.
    expect(await resolveAdmittedUserId(BOOTSTRAP_INSTANCE_ID, claimActor.workosUserId)).toBe(
      claimActor.userId,
    );

    const effectiveAccess = await resolveEffectiveAccess(
      { type: "user", userId: claimActor.userId },
      { organizationId: org },
    );
    for (const scope of FIRST_VALUE_OWNER_SCOPES) {
      expect(hasAuthorizationScope(effectiveAccess, scope)).toBe(true);
    }

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
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

  it("fails closed when the claiming WorkOS subject already has an admission", async () => {
    const preadmittedSecret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: PREADMITTED_INSTANCE_ID,
      instanceDisplayName: testDisplayName("Preadmitted bootstrap instance"),
      organizationDisplayName: testDisplayName("Preadmitted bootstrap org"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(PREADMITTED_ORG_ID),
        defaultTeamId: teamId.brand(PREADMITTED_TEAM_ID),
        claimId: PREADMITTED_CLAIM_ID,
      },
      bootstrapSecret: preadmittedSecret,
      workosClientId: "client_test_bootstrap",
    });

    await seedActiveUserAdmission({
      admissionId: PREADMITTED_ADMISSION_ID,
      instanceId: PREADMITTED_INSTANCE_ID,
      userId: userId.brand(PREADMITTED_EXISTING_USER_ID),
      workosUserId: PREADMITTED_WORKOS_USER_ID,
    });

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: PREADMITTED_INSTANCE_ID,
        actor: testUserActor(PREADMITTED_USER_ID, {
          workosUserId: PREADMITTED_WORKOS_USER_ID,
        }),
        bootstrapSecret: preadmittedSecret,
        operatorGrantId: PREADMITTED_OPERATOR_GRANT_ID,
        ownerMembershipId: membershipId.brand(PREADMITTED_MEM_ID),
      }),
    ).rejects.toMatchObject({ code: "23505" });

    expect(await loadClaimStatus(PREADMITTED_INSTANCE_ID)).toBe("pending");
    const grantUserIds = await loadBootstrapGrantUserIds(
      PREADMITTED_INSTANCE_ID,
      PREADMITTED_ORG_ID,
    );
    expect(grantUserIds.operatorUserIds).toEqual([]);
    expect(grantUserIds.membershipUserIds).toEqual([]);
    expect(await resolveAdmittedUserId(PREADMITTED_INSTANCE_ID, PREADMITTED_WORKOS_USER_ID)).toBe(
      PREADMITTED_EXISTING_USER_ID,
    );
  });

  it("records already-claimed denial audit inside the CAS transaction", async () => {
    const denialAuditSecret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: DENIAL_AUDIT_INSTANCE_ID,
      instanceDisplayName: testDisplayName("Denial audit bootstrap instance"),
      organizationDisplayName: testDisplayName("Denial audit bootstrap org"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(DENIAL_AUDIT_ORG_ID),
        defaultTeamId: teamId.brand(DENIAL_AUDIT_TEAM_ID),
        claimId: DENIAL_AUDIT_CLAIM_ID,
      },
      bootstrapSecret: denialAuditSecret,
      workosClientId: "client_test_bootstrap",
    });

    await completeBootstrapOperatorClaim({
      instanceId: DENIAL_AUDIT_INSTANCE_ID,
      actor: testUserActor(DENIAL_AUDIT_USER_ID),
      bootstrapSecret: denialAuditSecret,
      operatorGrantId: DENIAL_AUDIT_OPERATOR_GRANT_ID,
      ownerMembershipId: membershipId.brand(DENIAL_AUDIT_MEM_ID),
    });

    expect(await loadClaimStatus(DENIAL_AUDIT_INSTANCE_ID)).toBe("consumed");
    expect(await loadBootstrapDenialAuditRows(DENIAL_AUDIT_ORG_ID)).toEqual([]);

    const deniedResult = await withTenantScope({ kind: "service" }, async ({ sql }) =>
      executeBootstrapClaimInTransaction(sql, {
        instanceId: DENIAL_AUDIT_INSTANCE_ID,
        organizationId: organizationId.brand(DENIAL_AUDIT_ORG_ID),
        actor: testUserActor(DENIAL_AUDIT_OTHER_USER_ID),
        operatorGrantId: "iop_00000000000000000000000007",
        ownerMembershipId: membershipId.brand("mem_00000000000000000000000070"),
        defaultTeamId: teamId.brand(DENIAL_AUDIT_TEAM_ID),
      }),
    );

    expect(deniedResult).toBeNull();
    expect(await loadBootstrapDenialAuditRows(DENIAL_AUDIT_ORG_ID)).toEqual([
      {
        event_code: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied,
        outcome: "denied",
        result_code: BOOTSTRAP_ERROR_CODES.alreadyClaimed,
      },
    ]);
  });

  it("rolls back already-claimed denial audit when in-transaction audit write fails", async () => {
    const denialAuditSecret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: DENIAL_AUDIT_ROLLBACK_INSTANCE_ID,
      instanceDisplayName: testDisplayName("Denial audit rollback bootstrap instance"),
      organizationDisplayName: testDisplayName("Denial audit rollback bootstrap org"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(DENIAL_AUDIT_ROLLBACK_ORG_ID),
        defaultTeamId: teamId.brand(DENIAL_AUDIT_ROLLBACK_TEAM_ID),
        claimId: DENIAL_AUDIT_ROLLBACK_CLAIM_ID,
      },
      bootstrapSecret: denialAuditSecret,
      workosClientId: "client_test_bootstrap",
    });

    await completeBootstrapOperatorClaim({
      instanceId: DENIAL_AUDIT_ROLLBACK_INSTANCE_ID,
      actor: testUserActor(DENIAL_AUDIT_ROLLBACK_USER_ID),
      bootstrapSecret: denialAuditSecret,
      operatorGrantId: DENIAL_AUDIT_ROLLBACK_OPERATOR_GRANT_ID,
      ownerMembershipId: membershipId.brand(DENIAL_AUDIT_ROLLBACK_MEM_ID),
    });

    const auditSpy = vi
      .spyOn(bootstrapAudit, "recordBootstrapOperatorClaimDeniedInTransaction")
      .mockRejectedValue(new Error("simulated denial audit write failure"));

    await expect(
      withTenantScope({ kind: "service" }, async ({ sql }) =>
        executeBootstrapClaimInTransaction(sql, {
          instanceId: DENIAL_AUDIT_ROLLBACK_INSTANCE_ID,
          organizationId: organizationId.brand(DENIAL_AUDIT_ROLLBACK_ORG_ID),
          actor: testUserActor(DENIAL_AUDIT_OTHER_USER_ID),
          operatorGrantId: "iop_00000000000000000000000008",
          ownerMembershipId: membershipId.brand("mem_00000000000000000000000069"),
          defaultTeamId: teamId.brand(DENIAL_AUDIT_ROLLBACK_TEAM_ID),
        }),
      ),
    ).rejects.toThrow("simulated denial audit write failure");

    auditSpy.mockRestore();

    expect(await loadBootstrapDenialAuditRows(DENIAL_AUDIT_ROLLBACK_ORG_ID)).toEqual([]);
    expect(await loadClaimStatus(DENIAL_AUDIT_ROLLBACK_INSTANCE_ID)).toBe("consumed");
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

    const operators = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ id: string }[]>`
        SELECT id FROM instance_operators WHERE instance_id = ${ROLLBACK_INSTANCE_ID}
      `;
    });
    expect(operators).toEqual([]);
    expect(
      await resolveAdmittedUserId(
        ROLLBACK_INSTANCE_ID,
        testUserActor(ROLLBACK_USER_ID).workosUserId,
      ),
    ).toBeNull();

    const retryResult = await completeBootstrapOperatorClaim({
      instanceId: ROLLBACK_INSTANCE_ID,
      actor: testUserActor(ROLLBACK_USER_ID),
      bootstrapSecret: rollbackSecret,
      operatorGrantId: ROLLBACK_OPERATOR_GRANT_ID,
      ownerMembershipId: membershipId.brand(ROLLBACK_MEM_ID),
    });

    expect(retryResult.status.phase).toBe("complete");
    expect(await loadClaimStatus(ROLLBACK_INSTANCE_ID)).toBe("consumed");
    const grantUserIds = await loadBootstrapGrantUserIds(ROLLBACK_INSTANCE_ID, ROLLBACK_ORG_ID);
    expect(grantUserIds.operatorUserIds).toEqual([ROLLBACK_USER_ID]);
    expect(grantUserIds.membershipUserIds).toEqual([ROLLBACK_USER_ID]);
    expect(
      await resolveAdmittedUserId(
        ROLLBACK_INSTANCE_ID,
        testUserActor(ROLLBACK_USER_ID).workosUserId,
      ),
    ).toBe(testUserActor(ROLLBACK_USER_ID).userId);
  });

  it("rolls back claim consumption when post-grant Effective Access assertion fails", async () => {
    const assertionRollbackSecret = randomBytes(32).toString("base64url");

    await runInstanceBootstrap({
      instanceId: ASSERTION_ROLLBACK_INSTANCE_ID,
      instanceDisplayName: testDisplayName("Assertion rollback bootstrap instance"),
      organizationDisplayName: testDisplayName("Assertion rollback bootstrap org"),
      defaultTeamDisplayName: testDisplayName("Default"),
      resourceIds: {
        organizationId: organizationId.brand(ASSERTION_ROLLBACK_ORG_ID),
        defaultTeamId: teamId.brand(ASSERTION_ROLLBACK_TEAM_ID),
        claimId: ASSERTION_ROLLBACK_CLAIM_ID,
      },
      bootstrapSecret: assertionRollbackSecret,
      workosClientId: "client_test_bootstrap",
    });

    const assertionSpy = vi
      .spyOn(assertOwnerEffectiveAccess, "assertOwnerEffectiveAccessInTransaction")
      .mockRejectedValue(
        new BootstrapError(
          BOOTSTRAP_ERROR_CODES.claimNotAvailable,
          "simulated effective access assertion failure",
        ),
      );

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: ASSERTION_ROLLBACK_INSTANCE_ID,
        actor: testUserActor(ASSERTION_ROLLBACK_USER_ID),
        bootstrapSecret: assertionRollbackSecret,
        operatorGrantId: ASSERTION_ROLLBACK_OPERATOR_GRANT_ID,
        ownerMembershipId: membershipId.brand(ASSERTION_ROLLBACK_MEM_ID),
      }),
    ).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.claimNotAvailable,
    });

    assertionSpy.mockRestore();

    expect(await loadClaimStatus(ASSERTION_ROLLBACK_INSTANCE_ID)).toBe("pending");

    const grantUserIds = await loadBootstrapGrantUserIds(
      ASSERTION_ROLLBACK_INSTANCE_ID,
      ASSERTION_ROLLBACK_ORG_ID,
    );
    expect(grantUserIds.operatorUserIds).toEqual([]);
    expect(grantUserIds.membershipUserIds).toEqual([]);
    expect(
      await resolveAdmittedUserId(
        ASSERTION_ROLLBACK_INSTANCE_ID,
        testUserActor(ASSERTION_ROLLBACK_USER_ID).workosUserId,
      ),
    ).toBeNull();
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

    await withTenantScope({ kind: "service" }, async ({ sql }) => {
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
      withTenantScope({ kind: "service" }, async ({ sql }) => {
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

    const claimsOnInstanceB = await withTenantScope({ kind: "service" }, async ({ sql }) => {
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
