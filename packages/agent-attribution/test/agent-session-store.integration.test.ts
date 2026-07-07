import { userId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";
import { registerAgentSession } from "../src/agent-session-store.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const RUN = crypto.randomUUID().slice(0, 8);
const actorUserId = userId.brand(TEST_USER_ID);

describeIntegration("registerAgentSession", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("returns the existing active row when a duplicate insert conflicts", async () => {
    const humanSessionId = `session_register_conflict_${RUN}`;
    const ancestryKey = `ancestry_conflict_${RUN}`;
    const input = {
      humanSessionId,
      userId: actorUserId,
      harnessName: "agent.harness.test",
      ancestryKey,
    };

    const firstId = await registerAgentSession(input);
    const secondId = await registerAgentSession(input);

    expect(secondId).toBe(firstId);

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM agent_sessions
        WHERE human_session_id = ${humanSessionId}
          AND ancestry_key = ${ancestryKey}
          AND closed_at IS NULL
      `;
    });
    expect(rows[0]?.count).toBe("1");
  });

  it("is safe under concurrent registration for the same session and ancestry key", async () => {
    const humanSessionId = `session_register_concurrent_${RUN}`;
    const ancestryKey = `ancestry_concurrent_${RUN}`;
    const input = {
      humanSessionId,
      userId: actorUserId,
      harnessName: "agent.harness.test",
      ancestryKey,
    };

    const ids = await Promise.all([
      registerAgentSession(input),
      registerAgentSession(input),
      registerAgentSession(input),
    ]);

    expect(new Set(ids).size).toBe(1);

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM agent_sessions
        WHERE human_session_id = ${humanSessionId}
          AND ancestry_key = ${ancestryKey}
          AND closed_at IS NULL
      `;
    });
    expect(rows[0]?.count).toBe("1");
  });
});
