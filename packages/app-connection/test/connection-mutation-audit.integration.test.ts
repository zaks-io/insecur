import { PRODUCTION_AUDIT_EVENT_CODES, queryTenantAuditEvents } from "@insecur/audit";
import {
  appConnectionId,
  brandOpaqueResourceIdForPrefix,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  providerAppRegistrationId,
  providerCredentialId,
  userId,
  type AppConnectionId,
  type DisplayName,
  type OrganizationId,
} from "@insecur/domain";
import {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  createKeyring,
} from "@insecur/crypto";
import {
  TenantAppConnectionStore,
  TenantProviderAppRegistrationStore,
  TenantSensitiveMetadataStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { attachProviderCredential } from "../src/attach-provider-credential.js";
import { createCloudflareScopedTokenConnection } from "../src/create-cloudflare-scoped-token-connection.js";
import { createGitHubAppConnection } from "../src/create-github-app-connection.js";
import { disableCloudflareConnection } from "../src/disable-cloudflare-connection.js";
import { storeCloudflareConnectionBoundary } from "../src/store-cloudflare-connection-boundary.js";
import { updateGitHubAppConnection } from "../src/update-github-app-connection.js";
import type { CloudflareScopedTokenPort } from "../src/cloudflare-scoped-token-port.js";
import type { GitHubAppInstallationPort } from "../src/github-app-port.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
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
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const OP = operationId.brand("op_01JZ8AUD2R7M4T0V9X3C5D8F1");
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const REG_GH = providerAppRegistrationId.brand("preg_01JZ8AUD2R7M4T0V9X3C5D8F1");
const BOUNDARY = {
  allowedAccountId: "cf-account-123",
  allowedWorkerScript: "my-api-production",
} as const;
const GITHUB_BOUNDARY = {
  installationId: "12345678",
  owner: "insecur-org",
  allowedRepositories: ["insecur-org/api", "insecur-org/web"],
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

function createSuccessfulGitHubPort(): GitHubAppInstallationPort {
  return {
    verifyInstallation: vi.fn(async () => ({
      installationStatus: "active" as const,
      accessibleRepositoryCount: GITHUB_BOUNDARY.allowedRepositories.length,
      repositoriesWithinBoundary: true,
    })),
  };
}

async function seedProviderAppRegistration(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
    await new TenantProviderAppRegistrationStore(db).upsertRegistration({
      instanceId: TEST_INSTANCE_ID,
      registrationId: REG_GH,
      provider: "github",
      connectionMethod: "github-app",
      clientId: "Iv1.test-client-id",
      callbackPath: "/v1/auth/github/callback",
      status: "configured",
    });
  });
}

async function expectPersistedConnectionAudit(input: {
  readonly organizationId: OrganizationId;
  readonly auditEventId: string;
  readonly eventCode: string;
  readonly appConnectionId: AppConnectionId;
}): Promise<void> {
  const page = await queryTenantAuditEvents({
    organizationId: input.organizationId,
    filters: { eventCode: input.eventCode },
    pageSize: 100,
  });
  const event = page.events.find((candidate) => candidate.auditEventId === input.auditEventId);
  expect(event).toBeDefined();
  expect(event?.outcome).toBe("success");
  expect(event?.actor.type).toBe("user");
  expect(event?.actor.userId).toBe(ACTOR.userId);
  expect(event?.resource).toEqual({
    type: "app_connection",
    id: brandOpaqueResourceIdForPrefix("conn", input.appConnectionId),
  });
}

describeRls("connection mutation auditEventId persistence", () => {
  let keyring: ReturnType<typeof createKeyring>;

  beforeAll(async () => {
    await seedTenantBaseline();
    await seedProviderAppRegistration();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  beforeEach(() => {
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    keyring = createKeyring(createTestRootKey());
  });

  it("create returns a persisted connection.created audit event id", async () => {
    const connectionId = appConnectionId.brand("conn_01JZ8AUDCF2R7M4T0V9X3C5D8F1");
    const credentialId = providerCredentialId.brand("pcred_01JZ8AUDCF2R7M4T0V9X3C5D8F1");

    const result = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) =>
        createCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP,
          appConnectionId: connectionId,
          credentialId,
          displayName: testDisplayName("Audit create Cloudflare"),
          setupUserId: ACTOR.userId,
          boundary: BOUNDARY,
          tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
          keyring,
          cloudflarePort: createSuccessfulCloudflarePort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
    );

    await expectPersistedConnectionAudit({
      organizationId: ORG_A,
      auditEventId: result.auditEventId,
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionCreated,
      appConnectionId: connectionId,
    });
  });

  it("credential attach returns a persisted connection.credential_attached audit event id", async () => {
    const connectionId = appConnectionId.brand("conn_01JZ8AUDAT2R7M4T0V9X3C5D8F1");
    const credentialId = providerCredentialId.brand("pcred_01JZ8AUDAT2R7M4T0V9X3C5D8F1");

    const result = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const appConnectionStore = new TenantAppConnectionStore(db);
        const sensitiveMetadataStore = new TenantSensitiveMetadataStore(db);

        await appConnectionStore.createConnection({
          organizationId: ORG_A,
          appConnectionId: connectionId,
          provider: "cloudflare",
          connectionMethod: "scoped-api-token",
          displayName: testDisplayName("Audit attach Cloudflare"),
          setupUserId: ACTOR.userId,
          status: "pending_setup",
        });

        await storeCloudflareConnectionBoundary({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          appConnectionId: connectionId,
          boundary: BOUNDARY,
          providerAccountId: BOUNDARY.allowedAccountId,
          keyring,
          sensitiveMetadataStore,
        });

        return attachProviderCredential({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP,
          appConnectionId: connectionId,
          credentialId,
          tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
          keyring,
          cloudflarePort: createSuccessfulCloudflarePort(),
          appConnectionStore,
          sensitiveMetadataStore,
        });
      },
    );

    await expectPersistedConnectionAudit({
      organizationId: ORG_A,
      auditEventId: result.auditEventId,
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionCredentialAttached,
      appConnectionId: connectionId,
    });
  });

  it("reauth returns a persisted connection.validated audit event id", async () => {
    const connectionId = appConnectionId.brand("conn_01JZ8AUDGH2R7M4T0V9X3C5D8F1");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        instanceId: TEST_INSTANCE_ID,
        operationId: OP,
        appConnectionId: connectionId,
        providerAppRegistrationId: REG_GH,
        displayName: testDisplayName("Audit reauth GitHub"),
        setupUserId: ACTOR.userId,
        boundary: GITHUB_BOUNDARY,
        keyring,
        githubPort: createSuccessfulGitHubPort(),
        appConnectionStore: new TenantAppConnectionStore(db),
        providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    const validation = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) =>
        updateGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP,
          appConnectionId: connectionId,
          boundary: GITHUB_BOUNDARY,
          keyring,
          githubPort: createSuccessfulGitHubPort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
    );

    await expectPersistedConnectionAudit({
      organizationId: ORG_A,
      auditEventId: validation.auditEventId,
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionValidated,
      appConnectionId: connectionId,
    });
  });

  it("disconnect returns a persisted connection.disabled audit event id", async () => {
    const connectionId = appConnectionId.brand("conn_01JZ8AUDDS2R7M4T0V9X3C5D8F1");
    const credentialId = providerCredentialId.brand("pcred_01JZ8AUDDS2R7M4T0V9X3C5D8F1");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
      createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        operationId: OP,
        appConnectionId: connectionId,
        credentialId,
        displayName: testDisplayName("Audit disconnect Cloudflare"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
        keyring,
        cloudflarePort: createSuccessfulCloudflarePort(),
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      }),
    );

    const result = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) =>
        disableCloudflareConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          appConnectionId: connectionId,
          keyring,
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
    );

    await expectPersistedConnectionAudit({
      organizationId: ORG_A,
      auditEventId: result.auditEventId,
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.connectionDisabled,
      appConnectionId: connectionId,
    });
  });
});
