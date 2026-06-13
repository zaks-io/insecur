import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import { resetKeyringForTests } from "@insecur/crypto";
import {
  bytesToBase64Url,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import app from "../../src/index.js";

/**
 * First Value end-to-end loop driven through the real Worker HTTP routes against
 * real Postgres and real crypto — no package mocks. This is the seam the per-package
 * integration suites cannot cover: it proves the composed route stack round-trips a
 * secret value through write (encrypt+persist) → grant issue → grant consume (decrypt).
 *
 * Gated by integrationDatabaseReady so it skips cleanly without a runtime DB. The cloud
 * smoke layer (scripts/ci/smoke-first-value.mjs) drives this same sequence over HTTP
 * against a deployed preview and hard-fails when unconfigured.
 */

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ADMITTED_USER_ID = TEST_USER_ID;
const WORKOS_USER_ID = "user_01workos_fv_e2e";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: "inst_LOCAL_DEV",
  ADMITTED_USER_MAP_JSON: JSON.stringify({ [WORKOS_USER_ID]: ADMITTED_USER_ID }),
  INSTANCE_ROOT_KEY: {
    get: (): Promise<string> => Promise.resolve(RLS_TEST_ROOT_KEY_HEX),
  },
};

async function authHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(ADMITTED_USER_ID),
      workosUserId: WORKOS_USER_ID,
      sessionId: "session_fv_e2e",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

function uniqueVariableKey(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

describeIntegration("First Value loop (real DB, real crypto, HTTP routes)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
    resetKeyringForTests();
  });

  it("round-trips a secret value through write → grant issue → grant consume", async () => {
    const headers = await authHeaders();
    const variableKey = uniqueVariableKey("FV_E2E");
    const plaintext = `fv-e2e-secret-${crypto.randomUUID()}`;

    // 1. Write (encrypt + persist) through the real secrets route.
    const writeResponse = await app.request(
      `/v1/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: ORG_A, variableKey, value: plaintext }),
      },
      env,
    );
    expect(writeResponse.status).toBe(200);
    const writeBody = (await writeResponse.json()) as {
      ok: boolean;
      data: { variableKey: string; secretId: string; secretVersionId: string };
    };
    expect(writeBody.ok).toBe(true);
    expect(writeBody.data.variableKey).toBe(variableKey);
    expect(JSON.stringify(writeBody)).not.toContain(plaintext);

    // 2. Issue a one-use Runtime Injection Grant for that variable key.
    const issueResponse = await app.request(
      "/v1/runtime-injection/grants",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: ENV_A,
          variableKey,
        }),
      },
      env,
    );
    expect(issueResponse.status).toBe(200);
    const issueBody = (await issueResponse.json()) as {
      ok: boolean;
      data: { grantId: string };
    };
    expect(issueBody.ok).toBe(true);
    const grantId = issueBody.data.grantId;
    expect(grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(JSON.stringify(issueBody)).not.toContain(plaintext);

    // 3. Consume the grant (decrypt) and assert the value round-trips exactly.
    const consumeResponse = await app.request(
      `/v1/runtime-injection/grants/${grantId}/consume`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: ORG_A, variableKey }),
      },
      env,
    );
    expect(consumeResponse.status).toBe(200);
    const consumeBody = (await consumeResponse.json()) as {
      ok: boolean;
      delivery: { grantId: string; variableKey: string; encodedValueUtf8: string };
    };
    expect(consumeBody.ok).toBe(true);
    expect(consumeBody.delivery.grantId).toBe(grantId);
    expect(consumeBody.delivery.variableKey).toBe(variableKey);
    expect(consumeBody.delivery.encodedValueUtf8).toBe(
      bytesToBase64Url(new TextEncoder().encode(plaintext)),
    );

    // 4. Consume audit event written for this grant (metadata only, no plaintext).
    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ sql }) =>
        sql<{ event_code: string }[]>`
          SELECT event_code
          FROM audit_events
          WHERE resource_id = ${grantId}
          ORDER BY created_at
        `,
    );
    const eventCodes = auditRows.map((row) => row.event_code);
    expect(eventCodes).toContain("runtime_injection.grant_consumed");
    expect(JSON.stringify(auditRows)).not.toContain(plaintext);
  });

  it("denies grant replay (one-use) through the consume route", async () => {
    const headers = await authHeaders();
    const variableKey = uniqueVariableKey("FV_E2E_REPLAY");
    const plaintext = `fv-e2e-replay-${crypto.randomUUID()}`;

    await app.request(
      `/v1/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: ORG_A, variableKey, value: plaintext }),
      },
      env,
    );

    const issueResponse = await app.request(
      "/v1/runtime-injection/grants",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: ENV_A,
          variableKey,
        }),
      },
      env,
    );
    const grantId = ((await issueResponse.json()) as { data: { grantId: string } }).data.grantId;

    const consumePath = `/v1/runtime-injection/grants/${grantId}/consume`;
    const consumeBody = JSON.stringify({ organizationId: ORG_A, variableKey });

    const first = await app.request(
      consumePath,
      { method: "POST", headers, body: consumeBody },
      env,
    );
    expect(first.status).toBe(200);

    const replay = await app.request(
      consumePath,
      { method: "POST", headers, body: consumeBody },
      env,
    );
    expect(replay.status).toBe(404);
    const replayBody = (await replay.json()) as { ok: boolean; error: { code: string } };
    expect(replayBody.ok).toBe(false);
    expect(JSON.stringify(replayBody)).not.toContain(plaintext);
  });
});
