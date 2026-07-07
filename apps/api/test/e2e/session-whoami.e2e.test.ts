import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import { userId } from "@insecur/domain";
import app from "../../src/index.js";
import { createFakeRuntimeBinding } from "../support/fake-runtime-binding.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ADMITTED_USER_ID = TEST_USER_ID;
const WORKOS_USER_ID = TEST_WORKOS_USER_ID;
const RUNTIME_TOKEN_SIGNING_SECRET = "whoami-e2e-runtime-hop-secret-000000000000000000";
const SESSION_ID = "session_whoami_e2e";
const ANCESTRY_KEY = "whoami-e2e-ancestry";

const runtimeEnv = {
  INSTANCE_ROOT_KEY_V1: {
    get: (): Promise<string> => Promise.resolve(RLS_TEST_ROOT_KEY_HEX),
  },
  RUNTIME_TOKEN_SIGNING_SECRET,
};

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  RUNTIME_TOKEN_SIGNING_SECRET,
  RUNTIME: createFakeRuntimeBinding(runtimeEnv),
};

async function authHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(ADMITTED_USER_ID),
      workosUserId: WORKOS_USER_ID,
      sessionId: SESSION_ID,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return { Authorization: `Bearer ${minted.credential}` };
}

describeIntegration("session whoami (real DB, RUNTIME seam)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("auto-registers Tier 2 attribution and reports registered on follow-up read", async () => {
    const headers = await authHeaders();
    const query = new URLSearchParams({
      harnessName: "agent.harness.claude_code",
      ancestryKey: ANCESTRY_KEY,
    });

    const first = await app.request(
      `/v1/session/whoami?${query.toString()}`,
      { method: "GET", headers },
      env,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      ok: boolean;
      data: {
        attribution: { tier: string; agentSessionId?: string; harnessName?: string };
      };
    };
    expect(firstBody.ok).toBe(true);
    expect(firstBody.data.attribution.tier).toBe("registered");
    expect(firstBody.data.attribution.harnessName).toBe("agent.harness.claude_code");
    expect(firstBody.data.attribution.agentSessionId).toMatch(/^ags_[0-9A-Z]{26}$/);

    const second = await app.request(
      `/v1/session/whoami?${query.toString()}`,
      { method: "GET", headers },
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      ok: boolean;
      data: {
        attribution: { tier: string; agentSessionId?: string };
      };
    };
    expect(secondBody.data.attribution.tier).toBe("registered");
    expect(secondBody.data.attribution.agentSessionId).toBe(
      firstBody.data.attribution.agentSessionId,
    );

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ id: string }[]>`
        SELECT id
        FROM agent_sessions
        WHERE human_session_id = ${SESSION_ID}
          AND ancestry_key = ${ANCESTRY_KEY}
          AND closed_at IS NULL
      `;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(firstBody.data.attribution.agentSessionId);
  });
});
