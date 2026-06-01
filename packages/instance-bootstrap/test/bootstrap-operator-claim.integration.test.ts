import { randomBytes } from "node:crypto";
import {
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const BOOTSTRAP_INSTANCE_ID = "inst_BOOTSTRAP_CLAIM_TEST";
const BOOTSTRAP_ORG_ID = "org_00000000000000000000000077";
const BOOTSTRAP_TEAM_ID = "team_00000000000000000000000077";
const BOOTSTRAP_CLAIM_ID = "boc_00000000000000000000000001";
const BOOTSTRAP_OPERATOR_GRANT_ID = "iop_00000000000000000000000001";
const BOOTSTRAP_MEM_ID = "mem_00000000000000000000000077";
const CLAIM_USER_ID = "usr_00000000000000000000000077";
const OTHER_USER_ID = "usr_00000000000000000000000078";

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

describeIntegration("bootstrap operator claim", () => {
  let bootstrapSecret: string;

  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupBootstrapFixture(BOOTSTRAP_INSTANCE_ID);
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

  it("denies claim completion with an invalid bootstrap secret", async () => {
    const wrongSecret = randomBytes(32).toString("base64url");
    const claimUser = userId.brand(CLAIM_USER_ID);

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: BOOTSTRAP_INSTANCE_ID,
        userId: claimUser,
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
  });

  it("completes the claim once and grants owner Effective Access", async () => {
    const claimUser = userId.brand(CLAIM_USER_ID);
    const org = organizationId.brand(BOOTSTRAP_ORG_ID);

    const result = await completeBootstrapOperatorClaim({
      instanceId: BOOTSTRAP_INSTANCE_ID,
      userId: claimUser,
      bootstrapSecret,
      operatorGrantId: BOOTSTRAP_OPERATOR_GRANT_ID,
      ownerMembershipId: membershipId.brand(BOOTSTRAP_MEM_ID),
    });

    expect(result.status.phase).toBe("complete");
    expect(result.organizationId).toBe(org);

    const effectiveAccess = await resolveEffectiveAccess(
      { type: "user", userId: claimUser },
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
    const claimUser = userId.brand(CLAIM_USER_ID);
    const otherUser = userId.brand(OTHER_USER_ID);

    await expect(
      completeBootstrapOperatorClaim({
        instanceId: BOOTSTRAP_INSTANCE_ID,
        userId: otherUser,
        bootstrapSecret,
        operatorGrantId: "iop_00000000000000000000000002",
        ownerMembershipId: membershipId.brand("mem_00000000000000000000000079"),
      }),
    ).rejects.toMatchObject({
      code: BOOTSTRAP_ERROR_CODES.alreadyClaimed,
    });

    const status = await getBootstrapStatus(BOOTSTRAP_INSTANCE_ID);
    expect(status.phase).toBe("complete");
    if (status.phase === "complete") {
      expect(status.operatorUserId).toBe(claimUser);
    }

    const deniedAudits = await withTenantScope(
      { kind: "organization", organizationId: organizationId.brand(BOOTSTRAP_ORG_ID) },
      async (sql) => {
        return await sql<AuditRow[]>`
          SELECT event_code, outcome
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied}
        `;
      },
    );
    expect(deniedAudits.some((row) => row.outcome === "denied")).toBe(true);
  });
});

describe("BootstrapError", () => {
  it("exposes stable bootstrap error codes", () => {
    const error = new BootstrapError(BOOTSTRAP_ERROR_CODES.alreadyClaimed, "already claimed");
    expect(error.code).toBe("bootstrap.already_claimed");
  });
});
