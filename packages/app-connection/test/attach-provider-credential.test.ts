import {
  appConnectionId,
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  providerCredentialId,
  userId,
} from "@insecur/domain";
import { describe, beforeEach, expect, it, vi } from "vitest";

const { requireAppConnectionChangeEvidence } = vi.hoisted(() => ({
  requireAppConnectionChangeEvidence: vi.fn(),
}));

vi.mock("../src/consume-app-connection-change-evidence.js", () => ({
  requireAppConnectionChangeEvidence,
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { attachProviderCredential } from "../src/attach-provider-credential.js";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";
import { HighAssuranceChallengeError } from "@insecur/high-assurance";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const CONN = appConnectionId.brand("conn_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8EHM8S3V6X0Z2C5D8F1G4K");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E") };
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-01T00:00:00.000Z");

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

  it("fails closed before credential attach when high-assurance evidence is missing", async () => {
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

    await expect(
      attachProviderCredential({
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
        appConnectionStore,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing });

    expect(attachActiveProviderCredential).not.toHaveBeenCalled();
  });

  it("delegates credential attach after consuming operation-bound evidence", async () => {
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

    const wrapped = {
      organizationDataKeyVersion: 1,
      ciphertext: new Uint8Array([1, 2, 3]),
    };

    const result = await attachProviderCredential({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      appConnectionId: CONN,
      credentialId: CRED,
      wrapped,
      appConnectionStore,
    });

    expect(requireAppConnectionChangeEvidence).toHaveBeenCalledOnce();
    expect(attachActiveProviderCredential).toHaveBeenCalledWith({
      organizationId: ORG,
      appConnectionId: CONN,
      credentialId: CRED,
      connectionMethod: "scoped-api-token",
      wrapped,
    });
    expect(result).toBe(activated);
  });
});
