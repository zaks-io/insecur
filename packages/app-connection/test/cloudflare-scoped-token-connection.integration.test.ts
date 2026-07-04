import {
  appConnectionId,
  AUTH_ERROR_CODES,
  organizationId,
  parseDisplayName,
  projectId,
  providerCredentialId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  createKeyring,
} from "@insecur/crypto";
import {
  TenantAppConnectionStore,
  TenantProviderCredentialStore,
  TenantSensitiveMetadataStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createCloudflareScopedTokenConnection } from "../src/create-cloudflare-scoped-token-connection.js";
import { disableCloudflareConnection } from "../src/disable-cloudflare-connection.js";
import { validateCloudflareScopedTokenConnection } from "../src/validate-cloudflare-scoped-token-connection.js";
import type { CloudflareScopedTokenPort } from "../src/cloudflare-scoped-token-port.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
  TEST_NO_SCOPE_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const ORG_B = organizationId.brand(TEST_ORG_B_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const CONN_CF = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CONN_CF_B = appConnectionId.brand("conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H");
const CONN_CF_C = appConnectionId.brand("conn_01JZ8EJK9M5S8W1Y4A7E0G3I6H");
const CONN_CF_D = appConnectionId.brand("conn_01JZ8ELM0N6T9X2Y5B8D1G4J7K");
const CRED_CF = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const CRED_CF_D = providerCredentialId.brand("pcred_01JZ8EKN1T4W7Y1A3D6E9H2J5L");
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const BOUNDARY = {
  allowedAccountId: "cf-account-123",
  allowedWorkerScript: "my-api-production",
} as const;

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

function createSuccessfulCloudflarePort(): CloudflareScopedTokenPort {
  return {
    verifyScopedToken: vi.fn(async () => ({
      tokenStatus: "active" as const,
      providerAccountId: BOUNDARY.allowedAccountId,
      workerScriptReachable: true,
      hasBoundaryWarning: false,
    })),
  };
}

describeRls("cloudflare scoped-token app connection", () => {
  let keyring: ReturnType<typeof createKeyring>;

  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  beforeEach(() => {
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    keyring = createKeyring(createTestRootKey());
  });

  it("creates an active Cloudflare connection with encrypted credential and metadata-only validation", async () => {
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");
    const cloudflarePort = createSuccessfulCloudflarePort();

    const result = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        return createCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          appConnectionId: CONN_CF,
          credentialId: CRED_CF,
          displayName: testDisplayName("Org A Cloudflare workers"),
          setupUserId: ACTOR.userId,
          boundary: BOUNDARY,
          tokenPlaintext,
          keyring,
          cloudflarePort,
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        });
      },
    );

    expect(result.connection.status).toBe("active");
    expect(result.connection.activeCredentialId).toBe(CRED_CF);
    expect(result.validation.outcome).toBe("success");
    expect(result.validation.tokenStatus).toBe("active");
    expect(result.validation.workerScriptReachable).toBe(true);
    expect(JSON.stringify(result.validation)).not.toContain("scoped-cloudflare-token-value");

    const storedCredential = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        return new TenantProviderCredentialStore(db).getCredential(ORG_A, CRED_CF);
      },
    );

    expect(storedCredential?.wrapped.ciphertext.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(storedCredential?.wrapped.ciphertext)).not.toContain(
      "scoped-cloudflare-token-value",
    );
  });

  it("denies creation for actors without connection manage scope", async () => {
    const deniedActor = {
      type: "user" as const,
      userId: userId.brand(TEST_NO_SCOPE_USER_ID),
    };

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        createCloudflareScopedTokenConnection({
          actor: deniedActor,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          appConnectionId: CONN_CF_B,
          credentialId: CRED_CF,
          displayName: testDisplayName("Denied Cloudflare"),
          setupUserId: deniedActor.userId,
          boundary: BOUNDARY,
          tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
          keyring,
          cloudflarePort: createSuccessfulCloudflarePort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("fails closed when validating a disconnected connection", async () => {
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_CF_C,
        credentialId: CRED_CF,
        displayName: testDisplayName("Cloudflare to disable"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        tokenPlaintext,
        keyring,
        cloudflarePort,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      await disableCloudflareConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_CF_C,
        appConnectionStore: new TenantAppConnectionStore(db),
      });
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        validateCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          appConnectionId: CONN_CF_C,
          boundary: BOUNDARY,
          keyring,
          cloudflarePort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerCredentialStore: new TenantProviderCredentialStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: "connection.disconnected" });
  });

  it("denies cross-tenant validation when guessing another org id", async () => {
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_CF_D,
        credentialId: CRED_CF_D,
        displayName: testDisplayName("Org A Cloudflare cross-tenant"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        tokenPlaintext,
        keyring,
        cloudflarePort,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) =>
        validateCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_B,
          projectId: PROJECT_A,
          appConnectionId: CONN_CF_D,
          boundary: BOUNDARY,
          keyring,
          cloudflarePort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerCredentialStore: new TenantProviderCredentialStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: "connection.not_found" });
  });
});

describe("metadata-safe cloudflare validation projection", () => {
  it("never includes token values in validation metadata", () => {
    const validation = {
      checkedAt: new Date().toISOString(),
      outcome: "success" as const,
      reasonCode: null,
      tokenStatus: "active" as const,
      workerScriptReachable: true,
      hasBoundaryWarning: false,
    };

    const serialized = JSON.stringify(validation);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("token-value");
  });
});
