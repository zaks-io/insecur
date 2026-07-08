import * as audit from "@insecur/audit";
import {
  appConnectionId,
  auditEventId,
  AUTH_ERROR_CODES,
  APP_CONNECTION_ERROR_CODES,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  providerAppRegistrationId,
  userId,
  type DisplayName,
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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppConnectionError } from "../src/app-connection-error.js";
import { assertRepositoryInGitHubConnectionBoundary } from "../src/github-app-port.js";
import { createGitHubAppConnection } from "../src/create-github-app-connection.js";
import { disableGitHubConnection } from "../src/disable-github-connection.js";
import { updateGitHubAppConnection } from "../src/update-github-app-connection.js";
import { validateGitHubAppConnection } from "../src/validate-github-app-connection.js";
import type { GitHubAppInstallationPort } from "../src/github-app-port.js";
import { toMetadataSafeGitHubConnectionStatus } from "../src/metadata-safe-github-connection-status.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_USER_ID,
  TEST_NO_SCOPE_USER_ID,
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
const PROJECT_B = projectId.brand(TEST_PROJECT_B_ID);
const PROJECT_B_ALT = projectId.brand("prj_01JZ8ALT2R7M4T0V9X3C5D8F1G");
const OP_GH = operationId.brand("op_01JZ8GHOP2R7M4T0V9X3C5D8F1");
const CONN_GH = appConnectionId.brand("conn_01JZ8GH12R7M4T0V9X3C5D8F1G");
const CONN_GH_B = appConnectionId.brand("conn_01JZ8GH22R7M4T0V9X3C5D8F1G");
const CONN_GH_C = appConnectionId.brand("conn_01JZ8GH32R7M4T0V9X3C5D8F1G");
const CONN_GH_D = appConnectionId.brand("conn_01JZ8GH42R7M4T0V9X3C5D8F1G");
const CONN_GH_E = appConnectionId.brand("conn_01JZ8GH52R7M4T0V9X3C5D8F1G");
const CONN_GH_F = appConnectionId.brand("conn_01JZ8GH62R7M4T0V9X3C5D8F1G");
const CONN_GH_G = appConnectionId.brand("conn_01JZ8GH72R7M4T0V9X3C5D8F1G");
const CONN_GH_H = appConnectionId.brand("conn_01JZ8GH82R7M4T0V9X3C5D8F1G");
const CONN_GH_I = appConnectionId.brand("conn_01JZ8GH92R7M4T0V9X3C5D8F1G");
const REG_GH = providerAppRegistrationId.brand("preg_01JZ8GHRE2R7M4T0V9X3C5D8F1");
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const BOUNDARY = {
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

function createSuccessfulGitHubPort(): GitHubAppInstallationPort {
  return {
    verifyInstallation: vi.fn(async () => ({
      installationStatus: "active" as const,
      accessibleRepositoryCount: BOUNDARY.allowedRepositories.length,
      repositoriesWithinBoundary: true,
    })),
  };
}

async function seedProviderAppRegistration(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
    const store = new TenantProviderAppRegistrationStore(db);
    await store.upsertRegistration({
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

async function seedOrgBAlternateProject(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ sql }) => {
    await sql`
      INSERT INTO projects (id, org_id, display_name)
      VALUES (${PROJECT_B_ALT}, ${ORG_B}, ${"Org B alternate project"})
      ON CONFLICT (id) DO NOTHING
    `;
  });
}

async function cleanupOrgBAlternateProject(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ sql }) => {
    await sql`DELETE FROM projects WHERE id = ${PROJECT_B_ALT} AND org_id = ${ORG_B}`;
  });
}

describeRls("github app installation app connection", () => {
  let keyring: ReturnType<typeof createKeyring>;

  beforeAll(async () => {
    await seedTenantBaseline();
    await seedProviderAppRegistration();
  });

  afterAll(async () => {
    await cleanupOrgBAlternateProject();
    await closeRuntimeSql();
  });

  beforeEach(() => {
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    keyring = createKeyring(createTestRootKey());
  });

  it("creates an active GitHub connection with encrypted boundary metadata and metadata-only validation", async () => {
    const githubPort = createSuccessfulGitHubPort();

    const result = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        return createGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          instanceId: TEST_INSTANCE_ID,
          operationId: OP_GH,
          appConnectionId: CONN_GH,
          providerAppRegistrationId: REG_GH,
          displayName: testDisplayName("Org A GitHub Actions"),
          setupUserId: ACTOR.userId,
          boundary: BOUNDARY,
          keyring,
          githubPort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        });
      },
    );

    expect(result.connection.status).toBe("active");
    expect(result.connection.activeCredentialId).toBeNull();
    expect(result.validation.outcome).toBe("success");
    expect(result.validation.installationStatus).toBe("active");
    expect(result.validation.repositoriesWithinBoundary).toBe(true);
    expect(JSON.stringify(result.validation)).not.toContain("insecur-org/api");

    const storedField = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        return new TenantSensitiveMetadataStore(db).getField({
          organizationId: ORG_A,
          scopeProjectId: PROJECT_A,
          metadataType: "app_connection.github_boundary",
          recordResourceId: CONN_GH,
          fieldKey: "allowed_repositories",
        });
      },
    );

    expect(storedField?.wrapped.ciphertext.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(storedField?.wrapped.ciphertext)).not.toContain(
      "insecur-org/api",
    );
  });

  it("denies creation for actors without connection manage scope", async () => {
    const deniedActor = {
      type: "user" as const,
      userId: userId.brand(TEST_NO_SCOPE_USER_ID),
    };

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        createGitHubAppConnection({
          actor: deniedActor,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          instanceId: TEST_INSTANCE_ID,
          operationId: OP_GH,
          appConnectionId: CONN_GH_B,
          providerAppRegistrationId: REG_GH,
          displayName: testDisplayName("Denied GitHub"),
          setupUserId: deniedActor.userId,
          boundary: BOUNDARY,
          keyring,
          githubPort: createSuccessfulGitHubPort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("rejects wildcard repository boundaries during creation", async () => {
    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        createGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          instanceId: TEST_INSTANCE_ID,
          operationId: OP_GH,
          appConnectionId: CONN_GH_G,
          providerAppRegistrationId: REG_GH,
          displayName: testDisplayName("Wildcard GitHub"),
          setupUserId: ACTOR.userId,
          boundary: {
            ...BOUNDARY,
            allowedRepositories: ["insecur-org/*"],
          },
          keyring,
          githubPort: createSuccessfulGitHubPort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
  });

  it("rejects repository targets outside the configured boundary", async () => {
    expect(() =>
      assertRepositoryInGitHubConnectionBoundary(BOUNDARY, "other-org/secret-repo"),
    ).toThrow(AppConnectionError);
    try {
      assertRepositoryInGitHubConnectionBoundary(BOUNDARY, "other-org/secret-repo");
    } catch (error) {
      expect(error).toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
    }
  });

  it("validates using the stored encrypted boundary rather than caller-supplied values", async () => {
    const githubPort = createSuccessfulGitHubPort();

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        instanceId: TEST_INSTANCE_ID,
        operationId: OP_GH,
        appConnectionId: CONN_GH_C,
        providerAppRegistrationId: REG_GH,
        displayName: testDisplayName("GitHub stored boundary"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        keyring,
        githubPort,
        appConnectionStore: new TenantAppConnectionStore(db),
        providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      await validateGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_GH_C,
        keyring,
        githubPort,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    expect(githubPort.verifyInstallation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        installationId: BOUNDARY.installationId,
        owner: BOUNDARY.owner,
        allowedRepositories: BOUNDARY.allowedRepositories,
        providerAppRegistrationId: REG_GH,
      }),
    );
  });

  it("records auth.insufficient_scope when validation is denied for missing read scope", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: auditEventId.brand("aud_01JZ8AUD12R7M4T0V9X3C5D8F1") });
    try {
      const deniedActor = {
        type: "user" as const,
        userId: userId.brand(TEST_NO_SCOPE_USER_ID),
      };

      await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
        await createGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          instanceId: TEST_INSTANCE_ID,
          operationId: OP_GH,
          appConnectionId: CONN_GH_D,
          providerAppRegistrationId: REG_GH,
          displayName: testDisplayName("GitHub validation audit"),
          setupUserId: ACTOR.userId,
          boundary: BOUNDARY,
          keyring,
          githubPort: createSuccessfulGitHubPort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        });

        await expect(
          validateGitHubAppConnection({
            actor: deniedActor,
            organizationId: ORG_A,
            projectId: PROJECT_A,
            appConnectionId: CONN_GH_D,
            keyring,
            githubPort: createSuccessfulGitHubPort(),
            appConnectionStore: new TenantAppConnectionStore(db),
            sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
          }),
        ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
      });

      expect(writeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.connectionValidationDenied,
          outcome: "denied",
          denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope },
        }),
      );
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("fails closed when validating a disconnected connection", async () => {
    const githubPort = createSuccessfulGitHubPort();

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        instanceId: TEST_INSTANCE_ID,
        operationId: OP_GH,
        appConnectionId: CONN_GH_E,
        providerAppRegistrationId: REG_GH,
        displayName: testDisplayName("GitHub to disable"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        keyring,
        githubPort,
        appConnectionStore: new TenantAppConnectionStore(db),
        providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      await disableGitHubConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_GH_E,
        keyring,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        validateGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          appConnectionId: CONN_GH_E,
          keyring,
          githubPort,
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: "connection.disconnected" });
  });

  it("updates an active connection with new encrypted boundary metadata", async () => {
    const githubPort = createSuccessfulGitHubPort();
    const updatedBoundary = {
      ...BOUNDARY,
      allowedRepositories: ["insecur-org/api", "insecur-org/docs"],
    };

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        instanceId: TEST_INSTANCE_ID,
        operationId: OP_GH,
        appConnectionId: CONN_GH_H,
        providerAppRegistrationId: REG_GH,
        displayName: testDisplayName("GitHub to update"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        keyring,
        githubPort,
        appConnectionStore: new TenantAppConnectionStore(db),
        providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      const validation = await updateGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        operationId: OP_GH,
        appConnectionId: CONN_GH_H,
        boundary: updatedBoundary,
        keyring,
        githubPort,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      expect(validation.outcome).toBe("success");
      expect(validation.repositoriesWithinBoundary).toBe(true);
      expect(JSON.stringify(validation)).not.toContain("insecur-org/docs");
    });

    expect(githubPort.verifyInstallation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowedRepositories: updatedBoundary.allowedRepositories,
      }),
    );
  });

  it("rejects updates for disconnected connections", async () => {
    const githubPort = createSuccessfulGitHubPort();

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        instanceId: TEST_INSTANCE_ID,
        operationId: OP_GH,
        appConnectionId: CONN_GH_I,
        providerAppRegistrationId: REG_GH,
        displayName: testDisplayName("GitHub update disconnected"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        keyring,
        githubPort,
        appConnectionStore: new TenantAppConnectionStore(db),
        providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      await disableGitHubConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_GH_I,
        keyring,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        updateGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP_GH,
          appConnectionId: CONN_GH_I,
          boundary: BOUNDARY,
          keyring,
          githubPort,
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.disconnected });
  });

  it("denies cross-project validation when guessing another project's connection id", async () => {
    const githubPort = createSuccessfulGitHubPort();

    await seedOrgBAlternateProject();
    try {
      await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) => {
        await storeGithubRegistrationForOrgB(db);
        await createGitHubAppConnection({
          actor: ACTOR,
          organizationId: ORG_B,
          projectId: PROJECT_B,
          instanceId: TEST_INSTANCE_ID,
          operationId: OP_GH,
          appConnectionId: CONN_GH_F,
          providerAppRegistrationId: REG_GH,
          displayName: testDisplayName("Org B GitHub cross-project"),
          setupUserId: ACTOR.userId,
          boundary: BOUNDARY,
          keyring,
          githubPort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerAppRegistrationStore: new TenantProviderAppRegistrationStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        });
      });

      await expect(
        withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) =>
          validateGitHubAppConnection({
            actor: ACTOR,
            organizationId: ORG_B,
            projectId: PROJECT_B_ALT,
            appConnectionId: CONN_GH_F,
            keyring,
            githubPort,
            appConnectionStore: new TenantAppConnectionStore(db),
            sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
          }),
        ),
      ).rejects.toMatchObject({ code: "connection.not_found" });
    } finally {
      await cleanupOrgBAlternateProject();
    }
  });
});

async function storeGithubRegistrationForOrgB(
  db: Parameters<Parameters<typeof withTenantScope>[1]>[0]["db"],
): Promise<void> {
  await new TenantProviderAppRegistrationStore(db).upsertRegistration({
    instanceId: TEST_INSTANCE_ID,
    registrationId: REG_GH,
    provider: "github",
    connectionMethod: "github-app",
    clientId: "Iv1.test-client-id",
    callbackPath: "/v1/auth/github/callback",
    status: "configured",
  });
}

describe("metadata-safe github validation projection", () => {
  it("never includes repository names or installation secrets in projected connection status", () => {
    const projected = toMetadataSafeGitHubConnectionStatus({
      id: CONN_GH,
      organizationId: ORG_A,
      provider: "github",
      connectionMethod: "github-app",
      displayName: testDisplayName("GitHub projection"),
      status: "active",
      setupUserId: ACTOR.userId,
      activeCredentialId: null,
      statusReasonCode: null,
      lastValidationCheckedAt: new Date("2026-07-01T00:00:00.000Z"),
      lastValidationOutcome: "success",
      lastValidationReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(projected.validation).toMatchObject({ outcome: "success", reasonCode: null });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("insecur-org");
    expect(serialized).not.toContain("12345678");
    expect(projected.connection.hasActiveCredential).toBe(false);
  });
});
