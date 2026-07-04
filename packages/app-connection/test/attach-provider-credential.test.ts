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

const { requireAppConnectionChangeEvidence, withConnectionManageAccess } = vi.hoisted(() => ({
  requireAppConnectionChangeEvidence: vi.fn(),
  withConnectionManageAccess: vi.fn(),
}));

vi.mock("../src/consume-app-connection-change-evidence.js", () => ({
  requireAppConnectionChangeEvidence,
}));

vi.mock("../src/with-cloudflare-connection-access.js", () => ({
  withConnectionManageAccess,
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { AppConnectionError, APP_CONNECTION_ERROR_CODES } from "../src/app-connection-error.js";
import { attachProviderCredential } from "../src/attach-provider-credential.js";
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
    createdAt: NOW,
    updatedAt: NOW,
  };

  function attachInput(
    appConnectionStore: TenantAppConnectionStore,
    sensitiveMetadataStore: TenantSensitiveMetadataStore,
  ) {
    return {
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      appConnectionId: CONN,
      credentialId: CRED,
      wrapped: {
        organizationDataKeyVersion: 1,
        ciphertext: new Uint8Array([1, 2, 3]),
      },
      keyring: KEYRING,
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

    await expect(
      attachProviderCredential(attachInput(appConnectionStore, sensitiveMetadataStore)),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing });

    expect(withConnectionManageAccess).not.toHaveBeenCalled();
    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
  });

  it("routes credential attach through project-scoped manage access before activation", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);
    const activated: AppConnectionRow = {
      ...PENDING_CONNECTION,
      status: "active",
      activeCredentialId: CRED,
    };
    const attachActiveProviderCredential = vi.fn(async () => activated);
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;

    withConnectionManageAccess.mockImplementation(async ({ run }) => run(PENDING_CONNECTION));

    const result = await attachProviderCredential(
      attachInput(appConnectionStore, sensitiveMetadataStore),
    );

    expect(requireAppConnectionChangeEvidence).toHaveBeenCalledOnce();
    expect(withConnectionManageAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        appConnectionId: CONN,
        keyring: KEYRING,
        sensitiveMetadataStore,
      }),
    );
    expect(attachActiveProviderCredential).toHaveBeenCalledWith({
      organizationId: ORG,
      appConnectionId: CONN,
      credentialId: CRED,
      connectionMethod: "scoped-api-token",
      wrapped: {
        organizationDataKeyVersion: 1,
        ciphertext: new Uint8Array([1, 2, 3]),
      },
    });
    expect(result).toBe(activated);
  });

  it("does not activate credentials when project-scoped boundary proof fails", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);
    const attachActiveProviderCredential = vi.fn();
    const appConnectionStore = {
      getConnectionById: vi.fn(async () => PENDING_CONNECTION),
      attachActiveProviderCredential,
    } as unknown as TenantAppConnectionStore;
    const sensitiveMetadataStore = {} as TenantSensitiveMetadataStore;

    withConnectionManageAccess.mockRejectedValue(
      new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound),
    );

    await expect(
      attachProviderCredential(attachInput(appConnectionStore, sensitiveMetadataStore)),
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

    withConnectionManageAccess.mockImplementation(async ({ recordDenied }) => {
      await recordDenied();
      throw new AppConnectionError(AUTH_ERROR_CODES.insufficientScope);
    });

    await expect(
      attachProviderCredential(attachInput(appConnectionStore, sensitiveMetadataStore)),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
  });
});
