import {
  APP_CONNECTION_ERROR_CODES,
  AUTH_ERROR_CODES,
  appConnectionId,
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  providerCredentialId,
  userId,
} from "@insecur/domain";
import { createKeyring } from "@insecur/crypto";
import { describe, beforeEach, expect, it, vi } from "vitest";

const { requireAppConnectionChangeEvidence, withCloudflareConnectionManageAccess } = vi.hoisted(
  () => ({
    requireAppConnectionChangeEvidence: vi.fn(),
    withCloudflareConnectionManageAccess: vi.fn(),
  }),
);

vi.mock("../src/consume-app-connection-change-evidence.js", () => ({
  requireAppConnectionChangeEvidence,
}));

vi.mock("../src/with-cloudflare-connection-access.js", () => ({
  withCloudflareConnectionManageAccess,
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { AppConnectionError } from "../src/app-connection-error.js";
import { attachProviderCredential } from "../src/attach-provider-credential.js";
import type { CloudflareScopedTokenPort } from "../src/cloudflare-scoped-token-port.js";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import { HighAssuranceChallengeError } from "@insecur/high-assurance";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E") };
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-01T00:00:00.000Z");
const KEYRING = createKeyring(new Uint8Array(32).fill(9));
const BOUNDARY = {
  allowedAccountId: "cf-account-123",
  allowedWorkerScript: "my-api-production",
} as const;
const VALIDATION_RESULT = {
  tokenStatus: "active" as const,
  providerAccountId: "cf-account-123",
  workerScriptReachable: true,
  hasBoundaryWarning: false,
};

describe("attachProviderCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const PENDING_CONNECTION: AppConnectionRow = {
    id: CONN,
    organizationId: ORG,
    provider: "cloudflare",
    connectionMethod: "scoped-api-token",
    displayName: "Cloudflare workers",
    status: "pending_setup",
    setupUserId: SETUP_USER,
    activeCredentialId: null,
    statusReasonCode: null,
    lastValidationCheckedAt: null,
    lastValidationOutcome: null,
    lastValidationReasonCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  function successfulCloudflarePort(): CloudflareScopedTokenPort {
    return { verifyScopedToken: vi.fn(async () => VALIDATION_RESULT) };
  }

  function attachInput(
    appConnectionStore: TenantAppConnectionStore,
    sensitiveMetadataStore: TenantSensitiveMetadataStore,
    cloudflarePort: CloudflareScopedTokenPort,
  ) {
    return {
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      appConnectionId: CONN,
      credentialId: CRED,
      tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
      keyring: KEYRING,
      cloudflarePort,
      appConnectionStore,
      sensitiveMetadataStore,
    };
  }

  it("fails closed before boundary guard when high-assurance evidence is missing", async () => {
    const challengeError = new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is required",
    );
    requireAppConnectionChangeEvidence.mockImplementation(async (_input, onDenied) => {
      await onDenied(challengeError);
      throw challengeError;
    });

    const attachActiveProviderCredential = vi.fn();
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;
    const cloudflarePort = successfulCloudflarePort();

    await expect(
      attachProviderCredential(
        attachInput(appConnectionStore, sensitiveMetadataStore, cloudflarePort),
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing });

    expect(withCloudflareConnectionManageAccess).not.toHaveBeenCalled();
    expect(cloudflarePort.verifyScopedToken).not.toHaveBeenCalled();
    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
  });

  it("verifies the candidate token against the stored boundary before activation", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);
    const activated: AppConnectionRow = {
      ...PENDING_CONNECTION,
      status: "active",
      activeCredentialId: CRED,
    };
    const validated: AppConnectionRow = {
      ...activated,
      lastValidationCheckedAt: NOW,
      lastValidationOutcome: "success",
    };
    const attachActiveProviderCredential = vi.fn(async () => activated);
    const updateConnectionValidation = vi.fn(async () => validated);
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
      updateConnectionValidation,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;
    const cloudflarePort = successfulCloudflarePort();

    withCloudflareConnectionManageAccess.mockImplementation(async ({ run }) =>
      run(PENDING_CONNECTION, BOUNDARY),
    );

    const result = await attachProviderCredential(
      attachInput(appConnectionStore, sensitiveMetadataStore, cloudflarePort),
    );

    expect(requireAppConnectionChangeEvidence).toHaveBeenCalledOnce();
    expect(withCloudflareConnectionManageAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        appConnectionId: CONN,
        keyring: KEYRING,
        sensitiveMetadataStore,
      }),
    );
    expect(cloudflarePort.verifyScopedToken).toHaveBeenCalledWith({
      token: "scoped-cloudflare-token-value",
      allowedAccountId: BOUNDARY.allowedAccountId,
      allowedWorkerScript: BOUNDARY.allowedWorkerScript,
    });
    expect(attachActiveProviderCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        appConnectionId: CONN,
        credentialId: CRED,
        connectionMethod: "scoped-api-token",
      }),
    );
    const attachCall = attachActiveProviderCredential.mock.calls[0]?.[0] as {
      wrapped: { ciphertext: Uint8Array };
    };
    expect(new TextDecoder().decode(attachCall.wrapped.ciphertext)).not.toContain(
      "scoped-cloudflare-token-value",
    );
    expect(updateConnectionValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        appConnectionId: CONN,
        lastValidationOutcome: "success",
        lastValidationReasonCode: null,
      }),
    );
    expect(result.connection).toBe(validated);
    expect(result.auditEventId).toBe("aud_test");
  });

  it("does not activate credentials when provider verification fails", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);
    const attachActiveProviderCredential = vi.fn();
    const updateConnectionValidation = vi.fn();
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
      updateConnectionValidation,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;
    const cloudflarePort: CloudflareScopedTokenPort = {
      verifyScopedToken: vi.fn(async () => {
        throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.validationFailed);
      }),
    };

    withCloudflareConnectionManageAccess.mockImplementation(async ({ run }) =>
      run(PENDING_CONNECTION, BOUNDARY),
    );

    await expect(
      attachProviderCredential(
        attachInput(appConnectionStore, sensitiveMetadataStore, cloudflarePort),
      ),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.validationFailed });

    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
    expect(updateConnectionValidation).not.toHaveBeenCalled();
  });

  it("does not activate credentials when project-scoped boundary proof fails", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);
    const attachActiveProviderCredential = vi.fn();
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;

    withCloudflareConnectionManageAccess.mockRejectedValue(
      new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound),
    );

    await expect(
      attachProviderCredential(
        attachInput(appConnectionStore, sensitiveMetadataStore, successfulCloudflarePort()),
      ),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.notFound });

    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
  });

  it("records scope denial when manage access is insufficient", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);
    const attachActiveProviderCredential = vi.fn();
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;

    withCloudflareConnectionManageAccess.mockImplementation(async ({ recordDenied }) => {
      await recordDenied();
      throw new AppConnectionError(AUTH_ERROR_CODES.insufficientScope);
    });

    await expect(
      attachProviderCredential(
        attachInput(appConnectionStore, sensitiveMetadataStore, successfulCloudflarePort()),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
  });
});
