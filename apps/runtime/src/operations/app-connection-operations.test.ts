import {
  AUTH_ERROR_CODES,
  appConnectionId,
  organizationId,
  requestId,
  userId,
} from "@insecur/domain";
import {
  createAppConnectionCommand,
  disconnectAppConnectionCommand,
  getAppConnectionStatusCommand,
  listAppConnectionsCommand,
  reauthAppConnectionCommand,
  rotateAppConnectionCredentialCommand,
} from "@insecur/app-connection";
import type {
  CreateAppConnectionRpcInput,
  DisconnectAppConnectionRpcInput,
  GetAppConnectionStatusRpcInput,
  ListAppConnectionsRpcInput,
  ReauthAppConnectionRpcInput,
  RotateAppConnectionCredentialRpcInput,
} from "@insecur/worker-kit/rpc/runtime-connections-rpc-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAppConnectionOperation,
  disconnectAppConnectionOperation,
  getAppConnectionStatusOperation,
  listAppConnectionsOperation,
  reauthAppConnectionOperation,
  rotateAppConnectionCredentialOperation,
} from "./app-connection-operations.js";

vi.mock("@insecur/app-connection", () => ({
  listAppConnectionsCommand: vi.fn(),
  getAppConnectionStatusCommand: vi.fn(),
  createAppConnectionCommand: vi.fn(),
  rotateAppConnectionCredentialCommand: vi.fn(),
  reauthAppConnectionCommand: vi.fn(),
  disconnectAppConnectionCommand: vi.fn(),
}));

vi.mock("./metadata-operation-shared.js", () => ({
  assertUserOrganizationMembership: vi.fn(),
}));

vi.mock("../crypto/keyring-context.js", () => ({
  createKeyringFromRuntimeEnv: vi.fn(() => ({})),
}));

const organization = organizationId.brand("org_00000000000000000000000001");
const connection = appConnectionId.brand("conn_00000000000000000000000001");
const request = requestId.generate();
const actorToken = "verified-by-rpc-entry";
const actorUserId = userId.generate();
const accessActor = { type: "user" as const, userId: actorUserId };
const machineActor = {
  type: "machine" as const,
  machineIdentityId: "mach_00000000000000000000000001" as never,
  tokenScope: {
    organizationId: organization,
    projectId: "prj_00000000000000000000000001" as never,
  },
  credentialScopes: [] as const,
};

const metadataConnection = {
  id: connection,
  organizationId: organization,
  provider: "cloudflare" as const,
  connectionMethod: "scoped-api-token" as const,
  displayName: "Cloudflare workers" as never,
  status: "active" as const,
  statusReasonCode: null,
  hasActiveCredential: true,
  setupUserId: actorUserId,
  lastValidationCheckedAt: null,
  lastValidationOutcome: null,
  lastValidationReasonCode: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const operationContext = {
  env: {} as never,
  auditActor: { type: "user" as const, userId: actorUserId },
  accessActor,
};

describe("app connection operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAppConnectionsOperation forwards to list command for user actors", async () => {
    vi.mocked(listAppConnectionsCommand).mockResolvedValue([metadataConnection]);

    const input: ListAppConnectionsRpcInput = {
      organizationId: organization,
      actorToken,
      requestId: request,
    };
    const payload = await listAppConnectionsOperation({
      ...operationContext,
      input,
    });

    expect(payload.connections).toEqual([metadataConnection]);
    expect(listAppConnectionsCommand).toHaveBeenCalledWith({
      actor: accessActor,
      organizationId: organization,
    });
  });

  it("getAppConnectionStatusOperation forwards to status command", async () => {
    const statusPayload = {
      connection: metadataConnection,
      validation: null,
      cloudflareBoundary: {
        allowedAccountId: "cf-account-123",
        allowedWorkerScript: "my-api-production",
      },
      githubBoundary: null,
    };
    vi.mocked(getAppConnectionStatusCommand).mockResolvedValue(statusPayload);

    const input: GetAppConnectionStatusRpcInput = {
      organizationId: organization,
      appConnectionId: connection,
      actorToken,
      requestId: request,
    };
    const payload = await getAppConnectionStatusOperation({
      ...operationContext,
      input,
    });

    expect(payload).toEqual(statusPayload);
  });

  it("createAppConnectionOperation forwards create input to command layer", async () => {
    vi.mocked(createAppConnectionCommand).mockResolvedValue({
      connection: metadataConnection,
      validation: {
        checkedAt: "2026-07-01T00:00:00.000Z",
        outcome: "success",
        reasonCode: null,
        tokenStatus: "active",
        workerScriptReachable: true,
        hasBoundaryWarning: false,
      },
      auditEventId: "aud_create",
    });

    const input: CreateAppConnectionRpcInput = {
      organizationId: organization,
      instanceId: "inst_test",
      appConnectionId: connection,
      provider: "cloudflare",
      connectionMethod: "scoped-api-token",
      displayName: "Cloudflare workers" as never,
      requestId: request,
      actorToken,
      tokenUtf8: new TextEncoder().encode("token"),
      cloudflareBoundary: {
        allowedAccountId: "cf-account-123",
        allowedWorkerScript: "my-api-production",
      },
    };
    const payload = await createAppConnectionOperation({
      ...operationContext,
      input,
    });

    expect(payload.auditEventId).toBe("aud_create");
    expect(createAppConnectionCommand).toHaveBeenCalledOnce();
  });

  it("rotateAppConnectionCredentialOperation returns metadata-only dry-run payload", async () => {
    vi.mocked(rotateAppConnectionCredentialCommand).mockResolvedValue({
      dryRun: true,
      connection: metadataConnection,
      validation: null,
    });

    const input: RotateAppConnectionCredentialRpcInput = {
      organizationId: organization,
      appConnectionId: connection,
      requestId: request,
      actorToken,
      dryRun: true,
    };
    const payload = await rotateAppConnectionCredentialOperation({
      ...operationContext,
      input,
    });

    expect(payload.dryRun).toBe(true);
    expect(payload.validation).toBeNull();
    expect(payload.auditEventId).toBeNull();
  });

  it("reauthAppConnectionOperation forwards to reauth command", async () => {
    vi.mocked(reauthAppConnectionCommand).mockResolvedValue({
      connection: metadataConnection,
      validation: {
        checkedAt: "2026-07-01T00:00:00.000Z",
        outcome: "success",
        reasonCode: null,
        installationStatus: "active",
        accessibleRepositoryCount: 2,
        repositoriesWithinBoundary: true,
      },
    });

    const input: ReauthAppConnectionRpcInput = {
      organizationId: organization,
      appConnectionId: connection,
      requestId: request,
      actorToken,
    };
    const payload = await reauthAppConnectionOperation({
      ...operationContext,
      input,
    });

    expect(payload.connection.id).toBe(connection);
    expect(payload.auditEventId).toBe("aud_reauth");
  });

  it("disconnectAppConnectionOperation forwards to disconnect command", async () => {
    vi.mocked(disconnectAppConnectionCommand).mockResolvedValue({
      connection: { ...metadataConnection, status: "disconnected" },
    });

    const input: DisconnectAppConnectionRpcInput = {
      organizationId: organization,
      appConnectionId: connection,
      requestId: request,
      actorToken,
    };
    const payload = await disconnectAppConnectionOperation({
      ...operationContext,
      input,
    });

    expect(payload.connection.status).toBe("disconnected");
    expect(payload.auditEventId).toBe("aud_disconnect");
  });

  it("rejects machine actors for list and status operations", async () => {
    const listInput: ListAppConnectionsRpcInput = {
      organizationId: organization,
      actorToken,
      requestId: request,
    };
    await expect(
      listAppConnectionsOperation({
        ...operationContext,
        accessActor: machineActor,
        input: listInput,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
    expect(listAppConnectionsCommand).not.toHaveBeenCalled();

    const statusInput: GetAppConnectionStatusRpcInput = {
      organizationId: organization,
      appConnectionId: connection,
      actorToken,
      requestId: request,
    };
    await expect(
      getAppConnectionStatusOperation({
        ...operationContext,
        accessActor: machineActor,
        input: statusInput,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
    expect(getAppConnectionStatusCommand).not.toHaveBeenCalled();
  });

  it("rejects machine actors for mutating connection operations", async () => {
    const input: CreateAppConnectionRpcInput = {
      organizationId: organization,
      instanceId: "inst_test",
      appConnectionId: connection,
      provider: "cloudflare",
      connectionMethod: "scoped-api-token",
      displayName: "Cloudflare workers" as never,
      requestId: request,
      actorToken,
    };
    await expect(
      createAppConnectionOperation({
        ...operationContext,
        accessActor: machineActor,
        input,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
    expect(createAppConnectionCommand).not.toHaveBeenCalled();
  });
});
