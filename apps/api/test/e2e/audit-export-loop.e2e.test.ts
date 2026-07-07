import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  StaticAuditExportVerificationKeys,
  verifyAuditExport,
  writeAuditEvent,
} from "@insecur/audit";
import { createTestAuditExportKeyProviders } from "../../../../packages/audit/test/support/test-audit-export-keys.js";
import { assertAuditExportJsonlIsMetadataOnly } from "../../../../packages/audit/test/support/assert-audit-export-jsonl-metadata-only.js";
import {
  brandOpaqueResourceIdForPrefix,
  environmentId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../../../packages/tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../../packages/tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
  TEST_WORKOS_USER_ID,
} from "../../../../packages/tenant-store/test/rls/test-ids.js";
import { RLS_TEST_ROOT_KEY_HEX } from "../../../../packages/tenant-store/test/rls/test-root-key.js";
import app from "../../src/index.js";
import { createFakeRuntimeBinding } from "../support/fake-runtime-binding.js";
import { runAuditVerifyCommand } from "../../../../packages/cli/src/commands/audit-verify.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const ORG_B = organizationId.brand(TEST_ORG_B_ID);
const RUNTIME_TOKEN_SIGNING_SECRET = "audit-export-e2e-runtime-hop-secret-000000000000";

describeIntegration("audit export loop (real DB, HTTP routes)", () => {
  let auditExportEnvVars: Record<string, string>;
  let signingPublicKey: string;
  let hmacSecret: string;
  let verificationKeys: StaticAuditExportVerificationKeys;

  beforeAll(async () => {
    await seedTenantBaseline();
    const keys = await createTestAuditExportKeyProviders();
    auditExportEnvVars = {
      INSECUR_AUDIT_EXPORT_HMAC_SECRET: keys.hmacSecret,
      INSECUR_AUDIT_EXPORT_SIGNING_PRIVATE_KEY_PKCS8_BASE64URL:
        keys.signingPrivateKeyPkcs8Base64Url,
      INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY: keys.signingPublicKey,
    };
    signingPublicKey = keys.signingPublicKey;
    hmacSecret = keys.hmacSecret;
    verificationKeys = new StaticAuditExportVerificationKeys();
    verificationKeys.registerHmacKey(keys.hmacKey);
    verificationKeys.registerSigningKey(keys.signingKey);
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  async function makeEnv() {
    return {
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
      SESSION_SIGNING_SECRET: testSessionSigningSecret(),
      INSTANCE_ID: TEST_INSTANCE_ID,
      RUNTIME_TOKEN_SIGNING_SECRET,
      RUNTIME: createFakeRuntimeBinding({
        INSTANCE_ROOT_KEY_V1: {
          get: (): Promise<string> => Promise.resolve(RLS_TEST_ROOT_KEY_HEX),
        },
        RUNTIME_TOKEN_SIGNING_SECRET,
        ...auditExportEnvVars,
      }),
    };
  }

  async function authHeaders(
    env: Awaited<ReturnType<typeof makeEnv>>,
  ): Promise<Record<string, string>> {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: userId.brand(TEST_USER_ID),
        workosUserId: TEST_WORKOS_USER_ID,
        sessionId: "session_audit_export_e2e",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    return {
      Authorization: `Bearer ${minted.credential}`,
    };
  }

  it("exports tenant-qualified events that verify through audit verify", async () => {
    const env = await makeEnv();
    const request = requestId.brand("req_00000000000000000000000099");

    await writeAuditEvent({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
      organizationId: ORG_A,
      projectId: projectId.brand(TEST_PROJECT_A_ID),
      environmentId: environmentId.brand(TEST_ENV_A_ID),
      resource: {
        type: "organization",
        id: brandOpaqueResourceIdForPrefix("org", TEST_ORG_A_ID),
      },
      request: { requestId: request },
      details: {
        agentSessionId: "ags_00000000000000000000000011",
        harnessName: "agent.harness.claude_code",
      },
    });

    const response = await app.request(
      `/v1/orgs/${ORG_A}/audit-export?from=2020-01-01T00:00:00.000Z&to=2099-01-01T00:00:00.000Z`,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { jsonl: string; manifest: { organization_id: string; entry_count: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.data.manifest.organization_id).toBe(TEST_ORG_A_ID);
    expect(body.data.manifest.entry_count).toBeGreaterThan(0);
    expect(body.data.jsonl).toContain(TEST_ORG_A_ID);
    expect(body.data.jsonl).not.toContain(TEST_ORG_B_ID);
    assertAuditExportJsonlIsMetadataOnly(body.data.jsonl);

    const verification = await verifyAuditExport({
      jsonl: body.data.jsonl,
      manifest: body.data.manifest,
      expectedOrganizationId: ORG_A,
      keys: verificationKeys,
    });
    expect(verification.status).toBe("valid");

    const dir = await mkdtemp(join(tmpdir(), "insecur-audit-export-e2e-"));
    const jsonlPath = join(dir, "audit-export.jsonl");
    const manifestPath = join(dir, "audit-export.manifest.json");
    await writeFile(jsonlPath, body.data.jsonl, "utf8");
    await writeFile(manifestPath, `${JSON.stringify(body.data.manifest, null, 2)}\n`, "utf8");

    process.env.INSECUR_AUDIT_EXPORT_HMAC_SECRET = hmacSecret;
    process.env.INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY = signingPublicKey;

    const exitCode = await runAuditVerifyCommand(
      { json: true, quiet: true, verbose: false, orgId: ORG_A },
      jsonlPath,
      { manifestPath },
    );
    expect(exitCode).toBe(0);
  });

  it("does not include cross-tenant audit rows in the export", async () => {
    const env = await makeEnv();

    await writeAuditEvent({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      outcome: "success",
      actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
      organizationId: ORG_B,
      resource: {
        type: "secret",
        id: brandOpaqueResourceIdForPrefix("sec", "00000000000000000000000099"),
      },
      details: {
        noteId: "note_cross_tenant",
        noteHash: "hash_cross_tenant",
        noteLength: 12,
      },
    });

    const response = await app.request(
      `/v1/orgs/${ORG_A}/audit-export?from=2026-07-01T00:00:00.000Z&to=2026-07-02T00:00:00.000Z`,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; data: { jsonl: string } };
    expect(body.ok).toBe(true);
    expect(body.data.jsonl).not.toContain(TEST_ORG_B_ID);
    expect(body.data.jsonl).not.toContain("note_cross_tenant");
  });
});
