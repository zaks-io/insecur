import {
  appConnectionId,
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  providerCredentialId,
  userId,
} from "@insecur/domain";
import { createKeyring } from "@insecur/crypto";
import type { CloudflareScopedTokenPort } from "../src/cloudflare-scoped-token-port.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HighAssuranceChallengeError } from "@insecur/high-assurance";

const { requireAppConnectionChangeEvidence } = vi.hoisted(() => ({
  requireAppConnectionChangeEvidence: vi.fn(),
}));

vi.mock("../src/consume-app-connection-change-evidence.js", () => ({
  requireAppConnectionChangeEvidence,
}));

vi.mock("../src/assert-connection-access.js", () => ({
  assertConnectionManageScope: vi.fn(async () => undefined),
  isConnectionAccessDenied: vi.fn(() => false),
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { createCloudflareScopedTokenConnection } from "../src/create-cloudflare-scoped-token-connection.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const CONN = appConnectionId.brand("conn_01JZ8CFH2R7M4T0V9X3C5D8F1G");
const CRED = providerCredentialId.brand("pcred_01JZ8CHM8S3V6X0Z2C5D8F1G4K");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

describe("createCloudflareScopedTokenConnection high-assurance gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed before provider validation when high-assurance evidence is missing", async () => {
    const challengeError = new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is required",
    );
    requireAppConnectionChangeEvidence.mockImplementation(async (_input, onDenied) => {
      await onDenied(challengeError);
      throw challengeError;
    });

    const cloudflarePort: CloudflareScopedTokenPort = {
      verifyScopedToken: vi.fn(),
    };

    await expect(
      createCloudflareScopedTokenConnection({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        operationId: OP,
        appConnectionId: CONN,
        credentialId: CRED,
        displayName: (() => {
          const parsed = parseDisplayName("Cloudflare workers");
          if (!parsed.ok) {
            throw new Error(parsed.code);
          }
          return parsed.value;
        })(),
        setupUserId: ACTOR.userId,
        boundary: {
          allowedAccountId: "cf-account-123",
          allowedWorkerScript: "my-api-production",
        },
        tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
        keyring: createKeyring(new Uint8Array(32).fill(7)),
        cloudflarePort,
        appConnectionStore: {
          createConnection: vi.fn(),
          updateConnectionValidation: vi.fn(),
        } as never,
        sensitiveMetadataStore: {
          upsertField: vi.fn(),
        } as never,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing });

    expect(cloudflarePort.verifyScopedToken).not.toHaveBeenCalled();
    expect(requireAppConnectionChangeEvidence).toHaveBeenCalledOnce();
  });

  it("creates connection after consuming operation-bound evidence", async () => {
    requireAppConnectionChangeEvidence.mockResolvedValue(undefined);

    const validationResult = {
      providerAccountId: "cf-account-123",
      tokenStatus: "active" as const,
      workerScriptReachable: true,
      hasBoundaryWarning: false,
    };
    const cloudflarePort: CloudflareScopedTokenPort = {
      verifyScopedToken: vi.fn(async () => validationResult),
    };
    const parsedDisplayName = parseDisplayName("Cloudflare workers");
    if (!parsedDisplayName.ok) {
      throw new Error(parsedDisplayName.code);
    }

    const activated = {
      id: CONN,
      organizationId: ORG,
      provider: "cloudflare" as const,
      connectionMethod: "scoped-api-token" as const,
      displayName: parsedDisplayName.value,
      status: "active" as const,
      setupUserId: ACTOR.userId,
      activeCredentialId: CRED,
      statusReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    };

    const createConnection = vi.fn(async () => undefined);
    const getConnectionById = vi.fn(async () => ({
      ...activated,
      status: "pending_setup" as const,
      activeCredentialId: null,
    }));
    const attachActiveProviderCredential = vi.fn(async () => activated);
    const updateConnectionValidation = vi.fn(async () => activated);
    const upsertField = vi.fn(async () => undefined);

    const result = await createCloudflareScopedTokenConnection({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      appConnectionId: CONN,
      credentialId: CRED,
      displayName: parsedDisplayName.value,
      setupUserId: ACTOR.userId,
      boundary: {
        allowedAccountId: "cf-account-123",
        allowedWorkerScript: "my-api-production",
      },
      tokenPlaintext: new TextEncoder().encode("scoped-cloudflare-token-value"),
      keyring: createKeyring(new Uint8Array(32).fill(7)),
      cloudflarePort,
      appConnectionStore: {
        createConnection,
        getConnectionById,
        attachActiveProviderCredential,
        updateConnectionValidation,
      } as never,
      sensitiveMetadataStore: {
        upsertField,
      } as never,
    });

    expect(requireAppConnectionChangeEvidence).toHaveBeenCalledOnce();
    expect(cloudflarePort.verifyScopedToken).toHaveBeenCalledOnce();
    expect(createConnection).toHaveBeenCalledOnce();
    expect(upsertField).toHaveBeenCalled();
    expect(result.validation.outcome).toBe("success");
  });
});
