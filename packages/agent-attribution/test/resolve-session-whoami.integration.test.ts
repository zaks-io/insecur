import { organizationId, userId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";
import { resolveSessionWhoami } from "../src/resolve-session-whoami.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const RUN = crypto.randomUUID().slice(0, 8);
const actorUserId = userId.brand(TEST_USER_ID);

describeIntegration("resolveSessionWhoami (real DB)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("does not register Tier 2 attribution when organization context validation fails", async () => {
    const humanSessionId = `session_whoami_context_gate_${RUN}`;
    const ancestryKey = `ancestry_context_gate_${RUN}`;
    const unauthorizedOrg = organizationId.brand("org_00000000000000000000000099");

    await expect(
      resolveSessionWhoami({
        userId: actorUserId,
        sessionId: humanSessionId,
        sessionExpiresAt: "2026-07-08T00:00:00.000Z",
        agentMarked: false,
        organizationId: unauthorizedOrg,
        harnessName: "agent.harness.claude_code",
        ancestryKey,
      }),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ id: string }[]>`
        SELECT id
        FROM agent_sessions
        WHERE human_session_id = ${humanSessionId}
          AND ancestry_key = ${ancestryKey}
          AND closed_at IS NULL
      `;
    });
    expect(rows).toHaveLength(0);
  });
});
