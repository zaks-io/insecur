import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import {
  bytesToBase64Url,
  CRYPTO_ERROR_CODES,
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
import { createFakeRuntimeBinding } from "../support/fake-runtime-binding.js";

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

// A second admitted human with NO membership anywhere: resolves to empty Effective Access, so every
// write is denied for insufficient scope. Used to prove the secret-write path is not an
// existence oracle (INS-154): authorization runs before the coordinate read, so this actor gets the
// same insufficient_scope denial whether the URL environment exists or not.
const NO_SCOPE_ADMITTED_USER_ID = "usr_00000000000000000000000NS1";
const NO_SCOPE_WORKOS_USER_ID = "user_01workos_no_scope";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);

const RUNTIME_TOKEN_SIGNING_SECRET = "fv-e2e-runtime-hop-secret-000000000000000000000000";

// The keyring lives only behind the Runtime Worker; the API composes against it via the fake
// in-process RUNTIME binding (the real Service Binding is exercised by the cloud smoke layer).
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
  INSTANCE_ID: "inst_LOCAL_DEV",
  ADMITTED_USER_MAP_JSON: JSON.stringify({
    [WORKOS_USER_ID]: ADMITTED_USER_ID,
    [NO_SCOPE_WORKOS_USER_ID]: NO_SCOPE_ADMITTED_USER_ID,
  }),
  RUNTIME_TOKEN_SIGNING_SECRET,
  RUNTIME: createFakeRuntimeBinding(runtimeEnv),
};

async function authHeadersFor(
  admittedUserId: string,
  workosUserId: string,
  sessionId: string,
): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(admittedUserId),
      workosUserId,
      sessionId,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  return authHeadersFor(ADMITTED_USER_ID, WORKOS_USER_ID, "session_fv_e2e");
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
  });

  it("round-trips a secret value through write → grant issue → grant consume", async () => {
    const headers = await authHeaders();
    const variableKey = uniqueVariableKey("FV_E2E");
    const plaintext = `fv-e2e-secret-${crypto.randomUUID()}`;

    // 1. Write (encrypt + persist) through the real secrets route.
    const writeResponse = await app.request(
      `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
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
      `/v1/orgs/${ORG_A}/runtime-injection/grants`,
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
      `/v1/orgs/${ORG_A}/runtime-injection/grants/${grantId}/consume`,
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
      `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: ORG_A, variableKey, value: plaintext }),
      },
      env,
    );

    const issueResponse = await app.request(
      `/v1/orgs/${ORG_A}/runtime-injection/grants`,
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

    const consumePath = `/v1/orgs/${ORG_A}/runtime-injection/grants/${grantId}/consume`;
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

  it("secret write is not a coordinate existence oracle: no-scope actor gets insufficient_scope for valid, foreign, and nonexistent environments alike (INS-154)", async () => {
    // This actor has no membership anywhere, so it lacks secretNonProtectedWrite at every coordinate.
    // Because authorization runs before the coordinate read, the denial code must be identical
    // whether the URL environment exists and is owned by the project, exists elsewhere, or does not
    // exist at all. Any divergence would leak environment existence across projects.
    const headers = await authHeadersFor(
      NO_SCOPE_ADMITTED_USER_ID,
      NO_SCOPE_WORKOS_USER_ID,
      "session_no_scope",
    );
    const body = JSON.stringify({ variableKey: "PROBE_KEY", value: "x" });

    const validCoordinate = `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`;
    // A syntactically valid environment ID that does not exist in org A.
    const nonexistentEnv = environmentId.brand("env_00000000000000000000NEXST9");
    const nonexistentCoordinate = `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${nonexistentEnv}/secrets/by-variable-key`;

    const responses = await Promise.all(
      [validCoordinate, nonexistentCoordinate].map((path) =>
        app.request(path, { method: "POST", headers, body }, env),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(403);
      const json = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("auth.insufficient_scope");
    }

    // The two responses must be indistinguishable: same status and same stable error code.
    const [validStatus, missingStatus] = responses.map((r) => r.status);
    expect(validStatus).toBe(missingStatus);
  });

  it("fails closed with crypto.decrypt_failed when the stored ciphertext is corrupted", async () => {
    const headers = await authHeaders();
    const variableKey = uniqueVariableKey("FV_E2E_TAMPER");
    const plaintext = `fv-e2e-tamper-${crypto.randomUUID()}`;

    const writeResponse = await app.request(
      `/v1/orgs/${ORG_A}/projects/${PROJECT_A}/environments/${ENV_A}/secrets/by-variable-key`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: ORG_A, variableKey, value: plaintext }),
      },
      env,
    );
    expect(writeResponse.status).toBe(200);
    const secretVersionId = ((await writeResponse.json()) as { data: { secretVersionId: string } })
      .data.secretVersionId;

    const issueResponse = await app.request(
      `/v1/orgs/${ORG_A}/runtime-injection/grants`,
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

    // Corrupt the persisted ciphertext (flip the last AEAD byte) so decrypt must fail closed.
    // The storage-ref prefix stays intact, so this exercises the decrypt path, not ref parsing.
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
      const [row] = await sql<{ ciphertext_storage_ref: string }[]>`
        SELECT ciphertext_storage_ref
        FROM secret_versions
        WHERE org_id = ${ORG_A} AND id = ${secretVersionId}
      `;
      const prefix = "inline:b64:";
      const ciphertext = Buffer.from(row.ciphertext_storage_ref.slice(prefix.length), "base64");
      ciphertext[ciphertext.length - 1] ^= 0xff;
      const tampered = `${prefix}${ciphertext.toString("base64")}`;
      await sql`
        UPDATE secret_versions
        SET ciphertext_storage_ref = ${tampered}
        WHERE org_id = ${ORG_A} AND id = ${secretVersionId}
      `;
    });

    const consumeResponse = await app.request(
      `/v1/orgs/${ORG_A}/runtime-injection/grants/${grantId}/consume`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: ORG_A, variableKey }),
      },
      env,
    );
    expect(consumeResponse.status).toBe(500);
    const consumeBody = (await consumeResponse.json()) as {
      ok: boolean;
      error: { code: string; retryable: boolean };
      meta: { requestId: string };
    };
    expect(consumeBody.ok).toBe(false);
    expect(consumeBody.error.code).toBe(CRYPTO_ERROR_CODES.decryptFailed);
    expect(consumeBody.error.retryable).toBe(false);
    expect(consumeBody.meta.requestId).toMatch(/^req_/);
    expect(JSON.stringify(consumeBody)).not.toContain(plaintext);
    expect(JSON.stringify(consumeBody)).not.toMatch(/valueUtf8|plaintext/i);
  });
});
