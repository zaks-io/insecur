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

import { AppConnectionError } from "../src/app-connection-error.js";
import { createCloudflareScopedTokenConnection } from "../src/create-cloudflare-scoped-token-connection.js";
import { attachProviderCredential } from "../src/attach-provider-credential.js";
import { disableCloudflareConnection } from "../src/disable-cloudflare-connection.js";
import { storeCloudflareConnectionBoundary } from "../src/store-cloudflare-connection-boundary.js";
import { validateCloudflareScopedTokenConnection } from "../src/validate-cloudflare-scoped-token-connection.js";
import type { CloudflareScopedTokenPort } from "../src/cloudflare-scoped-token-port.js";
import { toMetadataSafeCloudflareConnectionStatus } from "../src/metadata-safe-cloudflare-connection-status.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedDataKeys } from "../../tenant-store/test/rls/seed-data-keys.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_ORG_KEY_B_ID,
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
/** Second project in org B for same-org cross-project denial tests (never seeded in org A). */
const PROJECT_B_ALT = projectId.brand("prj_01JZ8ALT2R7M4T0V9X3C5D8F1G");
const OP_CF = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const CONN_CF = appConnectionId.brand("conn_01JZ8CFH2R7M4T0V9X3C5D8F1G");
const CONN_CF_B = appConnectionId.brand("conn_01JZ8CGK5Q2R7V0X3Z6C9D1F4H");
const CONN_CF_C = appConnectionId.brand("conn_01JZ8CJK9M5S8W1Y4A7E0G3I6H");
const CONN_CF_D = appConnectionId.brand("conn_01JZ8CLM0N6T9X2Y5B8D1G4J7K");
const CONN_CF_E = appConnectionId.brand("conn_01JZ8CMN2P7U0X3Z6C9E2H5K8L");
const CONN_CF_F = appConnectionId.brand("conn_01JZ8CNP4Q9V2Y5A8D1G4J7M0N");
const CONN_CF_G = appConnectionId.brand("conn_01JZ8CQR6W0X3Y6B9E2H5K8M1P");
const CONN_CF_H = appConnectionId.brand("conn_01JZ8CRS8Y2Z5A8D1G4J7M0P3Q");
const CONN_CF_I = appConnectionId.brand("conn_01JZ8CTU0A4B7D9F2H5K8M1P3R");
const CONN_CF_J = appConnectionId.brand("conn_01JZ8CWY3E6H9K2N5Q8T1V4X7A");
const CRED_CF = providerCredentialId.brand("pcred_01JZ8CHM8S3V6X0Z2C5D8F1G4K");
const CRED_CF_D = providerCredentialId.brand("pcred_01JZ8CKN1T4W7Y1A3D6E9H2J5L");
const CRED_CF_E = providerCredentialId.brand("pcred_01JZ8CLP3U5X8Z1B4E7H0J3M6N");
const CRED_CF_F = providerCredentialId.brand("pcred_01JZ8CQR5V8Y1A4D7G0J3M6P9Q");
const CRED_CF_G = providerCredentialId.brand("pcred_01JZ8CRS7X0Z3B6E9H2K5M8P1R");
const CRED_CF_H = providerCredentialId.brand("pcred_01JZ8CTU9A3C6F0J3M6P9R2V5X");
const CRED_CF_I = providerCredentialId.brand("pcred_01JZ8CVW2D5G8J1M4P7S0U3Y6Z");
const CRED_CF_J = providerCredentialId.brand("pcred_01JZ8CXA4F7J0L3O6R9U2W5Y8A");
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

async function seedOrgBAlternateProject(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ sql }) => {
    await sql`
      INSERT INTO projects (id, org_id, display_name)
      VALUES (${PROJECT_B_ALT}, ${ORG_B}, ${"Org B alternate project"})
      ON CONFLICT (id) DO NOTHING
    `;
    await seedDataKeys(sql, {
      organizationId: TEST_ORG_B_ID,
      projectId: PROJECT_B_ALT,
      organizationDataKeyId: TEST_ORG_KEY_B_ID,
      projectDataKeyId: "pdk_01JZ8ALT2R7M4T0V9X3C5D8F1G",
    });
  });
}

async function cleanupOrgBAlternateProject(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ sql }) => {
    await sql`DELETE FROM project_data_keys WHERE project_id = ${PROJECT_B_ALT}`;
    await sql`DELETE FROM projects WHERE id = ${PROJECT_B_ALT} AND org_id = ${ORG_B}`;
  });
}

describeRls("cloudflare scoped-token app connection", () => {
  let keyring: ReturnType<typeof createKeyring>;

  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await cleanupOrgBAlternateProject();
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
          operationId: OP_CF,
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
          operationId: OP_CF,
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

  it("validates using the stored encrypted boundary rather than caller-supplied values", async () => {
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        operationId: OP_CF,
        appConnectionId: CONN_CF_E,
        credentialId: CRED_CF_E,
        displayName: testDisplayName("Cloudflare stored boundary"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        tokenPlaintext,
        keyring,
        cloudflarePort,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      await validateCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        appConnectionId: CONN_CF_E,
        keyring,
        cloudflarePort,
        appConnectionStore: new TenantAppConnectionStore(db),
        providerCredentialStore: new TenantProviderCredentialStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    expect(cloudflarePort.verifyScopedToken).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowedAccountId: BOUNDARY.allowedAccountId,
        allowedWorkerScript: BOUNDARY.allowedWorkerScript,
      }),
    );
  });

  it("records auth.insufficient_scope when validation is denied for missing read scope", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: auditEventId.brand("aud_01JZ8AUD22R7M4T0V9X3C5D8F1") });
    try {
      const deniedActor = {
        type: "user" as const,
        userId: userId.brand(TEST_NO_SCOPE_USER_ID),
      };

      await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
        await createCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP_CF,
          appConnectionId: CONN_CF_F,
          credentialId: CRED_CF_F,
          displayName: testDisplayName("Cloudflare validation audit"),
          setupUserId: ACTOR.userId,
          boundary: BOUNDARY,
          tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
          keyring,
          cloudflarePort: createSuccessfulCloudflarePort(),
          appConnectionStore: new TenantAppConnectionStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        });

        await expect(
          validateCloudflareScopedTokenConnection({
            actor: deniedActor,
            organizationId: ORG_A,
            projectId: PROJECT_A,
            operationId: OP_CF,
            appConnectionId: CONN_CF_F,
            keyring,
            cloudflarePort: createSuccessfulCloudflarePort(),
            appConnectionStore: new TenantAppConnectionStore(db),
            providerCredentialStore: new TenantProviderCredentialStore(db),
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
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        operationId: OP_CF,
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
        keyring,
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) =>
        validateCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP_CF,
          appConnectionId: CONN_CF_C,
          keyring,
          cloudflarePort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerCredentialStore: new TenantProviderCredentialStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: "connection.disconnected" });
  });

  it("denies cross-project validation when guessing another project's connection id", async () => {
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await seedOrgBAlternateProject();
    try {
      await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) => {
        await createCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_B,
          projectId: PROJECT_B,
          operationId: OP_CF,
          appConnectionId: CONN_CF_D,
          credentialId: CRED_CF_D,
          displayName: testDisplayName("Org B Cloudflare cross-project"),
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
            projectId: PROJECT_B_ALT,
            appConnectionId: CONN_CF_D,
            keyring,
            cloudflarePort,
            appConnectionStore: new TenantAppConnectionStore(db),
            providerCredentialStore: new TenantProviderCredentialStore(db),
            sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
          }),
        ),
      ).rejects.toMatchObject({ code: "connection.not_found" });
    } finally {
      await cleanupOrgBAlternateProject();
    }
  });

  it("denies cross-project disable when guessing another project's connection id", async () => {
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await seedOrgBAlternateProject();
    try {
      await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) => {
        await createCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_B,
          projectId: PROJECT_B,
          operationId: OP_CF,
          appConnectionId: CONN_CF_H,
          credentialId: CRED_CF_H,
          displayName: testDisplayName("Org B Cloudflare cross-project disable"),
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
          disableCloudflareConnection({
            actor: ACTOR,
            organizationId: ORG_B,
            projectId: PROJECT_B_ALT,
            appConnectionId: CONN_CF_H,
            keyring,
            appConnectionStore: new TenantAppConnectionStore(db),
            sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
          }),
        ),
      ).rejects.toMatchObject({ code: "connection.not_found" });
    } finally {
      await cleanupOrgBAlternateProject();
    }
  });

  it("denies cross-project credential attach when guessing another project's connection id", async () => {
    await seedOrgBAlternateProject();
    try {
      await withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) => {
        const appConnectionStore = new TenantAppConnectionStore(db);
        const sensitiveMetadataStore = new TenantSensitiveMetadataStore(db);

        await appConnectionStore.createConnection({
          organizationId: ORG_B,
          appConnectionId: CONN_CF_J,
          provider: "cloudflare",
          connectionMethod: "scoped-api-token",
          displayName: testDisplayName("Org B Cloudflare cross-project attach"),
          setupUserId: ACTOR.userId,
          status: "pending_setup",
        });

        await storeCloudflareConnectionBoundary({
          organizationId: ORG_B,
          projectId: PROJECT_B,
          appConnectionId: CONN_CF_J,
          boundary: BOUNDARY,
          providerAccountId: BOUNDARY.allowedAccountId,
          keyring,
          sensitiveMetadataStore,
        });
      });

      await expect(
        withTenantScope({ kind: "organization", organizationId: ORG_B }, async ({ db }) =>
          attachProviderCredential({
            actor: ACTOR,
            organizationId: ORG_B,
            projectId: PROJECT_B_ALT,
            operationId: OP_CF,
            appConnectionId: CONN_CF_J,
            credentialId: CRED_CF_J,
            tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
            keyring,
            cloudflarePort: createSuccessfulCloudflarePort(),
            appConnectionStore: new TenantAppConnectionStore(db),
            sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
          }),
        ),
      ).rejects.toMatchObject({ code: "connection.not_found" });
    } finally {
      await cleanupOrgBAlternateProject();
    }
  });

  it("denies cross-tenant validation when guessing another org id", async () => {
    const cloudflarePort = createSuccessfulCloudflarePort();
    const tokenPlaintext = new TextEncoder().encode("scoped-cloudflare-token-value");

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        operationId: OP_CF,
        appConnectionId: CONN_CF_I,
        credentialId: CRED_CF_I,
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
          operationId: OP_CF,
          appConnectionId: CONN_CF_I,
          keyring,
          cloudflarePort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerCredentialStore: new TenantProviderCredentialStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ),
    ).rejects.toMatchObject({ code: "connection.not_found" });
  });

  it("records connection.boundary_mismatch when stored boundary validation fails", async () => {
    const cloudflarePort: CloudflareScopedTokenPort = {
      verifyScopedToken: vi.fn(async () => {
        throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.boundaryMismatch);
      }),
    };

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        operationId: OP_CF,
        appConnectionId: CONN_CF_G,
        credentialId: CRED_CF_G,
        displayName: testDisplayName("Cloudflare boundary mismatch"),
        setupUserId: ACTOR.userId,
        boundary: BOUNDARY,
        tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
        keyring,
        cloudflarePort: createSuccessfulCloudflarePort(),
        appConnectionStore: new TenantAppConnectionStore(db),
        sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
      });

      await expect(
        validateCloudflareScopedTokenConnection({
          actor: ACTOR,
          organizationId: ORG_A,
          projectId: PROJECT_A,
          operationId: OP_CF,
          appConnectionId: CONN_CF_G,
          keyring,
          cloudflarePort,
          appConnectionStore: new TenantAppConnectionStore(db),
          providerCredentialStore: new TenantProviderCredentialStore(db),
          sensitiveMetadataStore: new TenantSensitiveMetadataStore(db),
        }),
      ).rejects.toMatchObject({ code: "connection.boundary_mismatch" });
    });
  });
});

describe("metadata-safe cloudflare validation projection", () => {
  it("never includes token values in the projected connection status", () => {
    const projected = toMetadataSafeCloudflareConnectionStatus({
      id: CONN_CF,
      organizationId: ORG_A,
      provider: "cloudflare",
      connectionMethod: "scoped-api-token",
      displayName: testDisplayName("Cloudflare projection"),
      status: "active",
      setupUserId: ACTOR.userId,
      activeCredentialId: CRED_CF,
      statusReasonCode: null,
      lastValidationCheckedAt: new Date("2026-07-01T00:00:00.000Z"),
      lastValidationOutcome: "success",
      lastValidationReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(projected.validation).toMatchObject({ outcome: "success", reasonCode: null });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("token-value");
    expect(serialized).not.toContain("pcred_");
    expect(projected.connection.hasActiveCredential).toBe(true);
  });
});
