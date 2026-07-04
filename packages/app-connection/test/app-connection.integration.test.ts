import {
  appConnectionId,
  operationId,
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
  encryptProviderCredential,
  type Keyring,
} from "@insecur/crypto";
import {
  TenantAppConnectionStore,
  TenantProviderCredentialStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { attachProviderCredential } from "../src/attach-provider-credential.js";
import { assertAppConnectionSyncEligible } from "../src/assert-app-connection-sync-eligible.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const { requireAppConnectionChangeEvidence } = vi.hoisted(() => ({
  requireAppConnectionChangeEvidence: vi.fn(async () => undefined),
}));

vi.mock("../src/consume-app-connection-change-evidence.js", () => ({
  requireAppConnectionChangeEvidence,
}));

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const ORG_B = organizationId.brand(TEST_ORG_B_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const CONN_A = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CONN_B = appConnectionId.brand("conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H");
const CONN_C = appConnectionId.brand("conn_01JZ8EJK9M5S8W1Y4A7E0G3I6H");
const CRED_A = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const OP_A = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const SETUP_USER = userId.brand(TEST_USER_ID);
const ACTOR = { type: "user" as const, userId: SETUP_USER };

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

describeRls("app connection tenant isolation and credential encryption", () => {
  let keyring: Keyring;

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

  it("denies cross-tenant App Connection reads when guessing another org id", async () => {
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      const store = new TenantAppConnectionStore(db);
      await store.createConnection({
        organizationId: ORG_A,
        appConnectionId: CONN_A,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        displayName: testDisplayName("Org A Cloudflare"),
        setupUserId: SETUP_USER,
        status: "pending_setup",
      });
    });

    const foreignConnection = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantAppConnectionStore(db);
        return store.getConnectionById(ORG_B, CONN_A);
      },
    );

    expect(foreignConnection).toBeNull();
  });

  it("stores provider credentials only through encrypted wrappers and activates the connection", async () => {
    const plaintext = new TextEncoder().encode("scoped-cloudflare-token-value");
    const wrapped = await encryptProviderCredential(
      keyring,
      {
        organizationId: ORG_A,
        appConnectionId: CONN_B,
        provider: "scoped-api-token",
        credentialId: CRED_A,
      },
      plaintext,
    );

    const activated = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const appConnectionStore = new TenantAppConnectionStore(db);

        await appConnectionStore.createConnection({
          organizationId: ORG_A,
          appConnectionId: CONN_B,
          provider: "cloudflare",
          connectionMethod: "scoped-api-token",
          displayName: testDisplayName("Org A Cloudflare token"),
          setupUserId: SETUP_USER,
          status: "pending_setup",
        });

        return attachProviderCredential({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP_A,
          appConnectionId: CONN_B,
          credentialId: CRED_A,
          wrapped,
          appConnectionStore,
        });
      },
    );

    expect(activated.status).toBe("active");
    expect(activated.activeCredentialId).toBe(CRED_A);

    const storedCredential = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantProviderCredentialStore(db);
        return store.getCredential(ORG_A, CRED_A);
      },
    );

    expect(storedCredential?.wrapped.ciphertext.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(storedCredential?.wrapped.ciphertext)).not.toContain(
      "scoped-cloudflare-token-value",
    );

    expect(() => assertAppConnectionSyncEligible({ connection: activated })).not.toThrow();
  });

  it("fails closed for disconnected connections during sync eligibility checks", async () => {
    const disconnected = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantAppConnectionStore(db);
        await store.createConnection({
          organizationId: ORG_A,
          appConnectionId: CONN_C,
          provider: "github",
          connectionMethod: "github-app",
          displayName: testDisplayName("Org A GitHub"),
          setupUserId: SETUP_USER,
          status: "disconnected",
          statusReasonCode: "connection.disconnected",
        });
        return store.getConnectionById(ORG_A, CONN_C);
      },
    );

    expect(disconnected).not.toBeNull();
    if (disconnected === null) {
      throw new Error("expected disconnected connection");
    }
    expect(() => assertAppConnectionSyncEligible({ connection: disconnected })).toThrow();
  });
});
