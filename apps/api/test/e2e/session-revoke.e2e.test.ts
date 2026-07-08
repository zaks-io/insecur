import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { userId } from "@insecur/domain";
import { isCliSessionRevoked, revokeCliSession } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import app from "../../src/index.js";
import { createFakeRuntimeBinding } from "../support/fake-runtime-binding.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const RUNTIME_TOKEN_SIGNING_SECRET = "session-revoke-runtime-hop-secret-000000000000";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: TEST_INSTANCE_ID,
  RUNTIME_TOKEN_SIGNING_SECRET,
  RUNTIME: createFakeRuntimeBinding({
    INSTANCE_ROOT_KEY_V1: { get: async () => "00".repeat(32) },
    RUNTIME_TOKEN_SIGNING_SECRET,
  }),
};

async function authHeaders(sessionId: string): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(TEST_USER_ID),
      workosUserId: TEST_WORKOS_USER_ID,
      sessionId,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

describeIntegration("session revoke integration", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    const { closeRuntimeSql } = await import("@insecur/tenant-store");
    await closeRuntimeSql();
  });

  it("revokes the calling session and rejects replay on whoami", async () => {
    const sessionId = "session_revoke_integration";
    const headers = await authHeaders(sessionId);

    const whoamiBefore = await app.request("/v1/session/whoami", { method: "GET", headers }, env);
    expect(whoamiBefore.status).toBe(200);

    const revoke = await app.request(
      "/v1/session/revoke",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(revoke.status).toBe(200);
    const revokeBody: unknown = await revoke.json();
    expect(revokeBody).toMatchObject({ ok: true, data: { revoked: true } });

    await expect(isCliSessionRevoked(TEST_INSTANCE_ID, sessionId)).resolves.toBe(true);

    const whoamiAfter = await app.request("/v1/session/whoami", { method: "GET", headers }, env);
    expect(whoamiAfter.status).toBe(401);
    const whoamiBody: unknown = await whoamiAfter.json();
    expect(whoamiBody).toMatchObject({
      ok: false,
      error: { code: "auth.invalid" },
    });
  });

  it("no-ops revoke without authentication", async () => {
    const response = await app.request(
      "/v1/session/revoke",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, data: { revoked: false } });
  });

  it("is idempotent when revoking the same session twice", async () => {
    const sessionId = "session_revoke_idempotent";
    const headers = await authHeaders(sessionId);
    const first = await app.request(
      "/v1/session/revoke",
      { method: "POST", headers, body: "{}" },
      env,
    );
    const second = await app.request(
      "/v1/session/revoke",
      { method: "POST", headers, body: "{}" },
      env,
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ ok: true, data: { revoked: true } });
    await expect(second.json()).resolves.toMatchObject({ ok: true, data: { revoked: true } });
    await expect(
      revokeCliSession(
        TEST_INSTANCE_ID,
        sessionId,
        userId.brand(TEST_USER_ID),
        new Date(Date.now() + 86_400_000),
      ),
    ).resolves.toEqual({ revoked: true });
  });
});
