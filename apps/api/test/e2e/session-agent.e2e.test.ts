import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { buildAncestryKey } from "@insecur/agent-attribution";
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
const RUNTIME_TOKEN_SIGNING_SECRET = "test-runtime-token-signing-placeholder";
const HUMAN_SESSION_ID = "session_agent_e2e_human";
const ANCESTRY_KEY = buildAncestryKey();

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

async function humanAuthHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(ADMITTED_USER_ID),
      workosUserId: WORKOS_USER_ID,
      sessionId: HUMAN_SESSION_ID,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return { Authorization: `Bearer ${minted.credential}` };
}

describeIntegration("session agent derive/register (real DB, RUNTIME seam)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("derives an agent-marked session and reports derived attribution on whoami", async () => {
    const headers = await humanAuthHeaders();
    const derive = await app.request(
      "/v1/session/agent/derive",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ harnessName: "agent.harness.claude_code" }),
      },
      env,
    );
    expect(derive.status).toBe(200);
    const agentCredential = derive.headers.get("x-insecur-session-credential");
    expect(agentCredential).toBeTruthy();
    const deriveBody: unknown = await derive.json();
    expect(deriveBody).toMatchObject({
      ok: true,
      data: {
        sessionId: HUMAN_SESSION_ID,
        agentSessionId: expect.stringMatching(/^ags_[0-9A-Z]{26}$/),
      },
    });

    const whoami = await app.request(
      "/v1/session/whoami",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${agentCredential}` },
      },
      env,
    );
    expect(whoami.status).toBe(200);
    const whoamiBody = (await whoami.json()) as {
      ok: boolean;
      data: { attribution: { tier: string; agentSessionId?: string; harnessName?: string } };
    };
    expect(whoamiBody.ok).toBe(true);
    expect(whoamiBody.data.attribution.tier).toBe("derived");
    expect(whoamiBody.data.attribution.harnessName).toBe("agent.harness.claude_code");
    expect(whoamiBody.data.attribution.agentSessionId).toMatch(/^ags_[0-9A-Z]{26}$/);
  });

  it("registers an agent session idempotently and reports registered attribution on whoami", async () => {
    const headers = await humanAuthHeaders();
    const payload = {
      harnessName: "agent.harness.claude_code",
      ancestryKey: `${ANCESTRY_KEY}-register-e2e`,
    };

    const first = await app.request(
      "/v1/session/agent/register",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      ok: boolean;
      data: { agentSessionId: string; harnessName: string };
    };
    expect(firstBody.ok).toBe(true);

    const second = await app.request(
      "/v1/session/agent/register",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      env,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      ok: boolean;
      data: { agentSessionId: string };
    };
    expect(secondBody.data.agentSessionId).toBe(firstBody.data.agentSessionId);

    const whoami = await app.request(
      `/v1/session/whoami?agentSessionId=${firstBody.data.agentSessionId}&harnessName=${payload.harnessName}&ancestryKey=${payload.ancestryKey}`,
      { method: "GET", headers },
      env,
    );
    expect(whoami.status).toBe(200);
    const whoamiBody = (await whoami.json()) as {
      ok: boolean;
      data: { attribution: { tier: string; agentSessionId?: string } };
    };
    expect(whoamiBody.data.attribution.tier).toBe("registered");
    expect(whoamiBody.data.attribution.agentSessionId).toBe(firstBody.data.agentSessionId);

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<{ id: string }[]>`
        SELECT id
        FROM agent_sessions
        WHERE human_session_id = ${HUMAN_SESSION_ID}
          AND ancestry_key = ${payload.ancestryKey}
          AND closed_at IS NULL
      `;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(firstBody.data.agentSessionId);
  });
});
