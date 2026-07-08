import {
  APP_CONNECTION_ERROR_CODES,
  AUTH_ERROR_CODES,
  appConnectionId,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { createKeyring } from "@insecur/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gateMocks = vi.hoisted(() => ({
  runAppConnectionChangeGate: vi.fn(),
  runAppConnectionCredentialChangeGate: vi.fn(),
  beginAppConnectionChangeCommand: vi.fn(),
}));

vi.mock("../src/app-connection-change-gate.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app-connection-change-gate.js")>();
  return {
    ...actual,
    runAppConnectionChangeGate: gateMocks.runAppConnectionChangeGate,
    runAppConnectionCredentialChangeGate: gateMocks.runAppConnectionCredentialChangeGate,
    beginAppConnectionChangeCommand: gateMocks.beginAppConnectionChangeCommand,
  };
});

vi.mock("../src/load-org-app-connection.js", () => ({
  withOrgAppConnectionKeyring: vi.fn(),
}));

vi.mock("../src/disable-cloudflare-connection.js", () => ({
  disableCloudflareConnection: vi.fn(),
}));

vi.mock("../src/load-cloudflare-connection-boundary.js", () => ({
  loadCloudflareConnectionBoundary: vi.fn(),
}));

vi.mock("../src/load-github-connection-boundary.js", () => ({
  loadGitHubConnectionBoundary: vi.fn(),
}));

vi.mock("../src/reauth-github-app-connection.js", () => ({
  reauthGitHubAppConnection: vi.fn(),
}));

vi.mock("../src/rotate-cloudflare-credential.js", () => ({
  dryRunCloudflareCredentialRotation: vi.fn(),
  rotateCloudflareScopedTokenCredential: vi.fn(),
}));

vi.mock("../src/assert-connection-access.js", () => ({
  assertConnectionReadScope: vi.fn(async () => undefined),
  assertConnectionManageScope: vi.fn(async () => undefined),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantAppConnectionStore: vi.fn(),
  };
});

import { withTenantScope } from "@insecur/tenant-store";
import { requireUserActorForConnectionCommand } from "../src/app-connection-change-gate.js";
import { createAppConnectionCommand } from "../src/create-app-connection-command.js";
import { disableCloudflareConnection } from "../src/disable-cloudflare-connection.js";
import { disconnectAppConnectionCommand } from "../src/disconnect-app-connection-command.js";
import { getAppConnectionStatusCommand } from "../src/get-app-connection-status-command.js";
import { listAppConnectionsCommand } from "../src/list-app-connections-command.js";
import { orgScopedConnectionProjectId } from "../src/org-scoped-connection-project-id.js";
import { reauthAppConnectionCommand } from "../src/reauth-app-connection-command.js";
import { rotateAppConnectionCredentialCommand } from "../src/rotate-app-connection-credential-command.js";
import { withOrgAppConnectionKeyring } from "../src/load-org-app-connection.js";
import { loadCloudflareConnectionBoundary } from "../src/load-cloudflare-connection-boundary.js";
import { loadGitHubConnectionBoundary } from "../src/load-github-connection-boundary.js";
import { reauthGitHubAppConnection } from "../src/reauth-github-app-connection.js";
import {
  dryRunCloudflareCredentialRotation,
  rotateCloudflareScopedTokenCredential,
} from "../src/rotate-cloudflare-credential.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const CONN = appConnectionId.brand("conn_01JZ8CFH2R7M4T0V9X3C5D8F1G");
const REQUEST = requestId.generate();
const USER = userId.brand("usr_00000000000000000000000001");
const USER_ACTOR = { type: "user" as const, userId: USER };
const MACHINE_ACTOR = {
  type: "machine" as const,
  machineIdentityId: "mach_00000000000000000000000001" as never,
  tokenScope: { organizationId: ORG, projectId: PROJECT },
  credentialScopes: [] as const,
};
const KEYRING = createKeyring(new Uint8Array(32).fill(3));

function displayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

describe("app connection command validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateMocks.runAppConnectionChangeGate.mockResolvedValue({
      operationId: OP,
      projectId: orgScopedConnectionProjectId(),
    });
    gateMocks.runAppConnectionCredentialChangeGate.mockResolvedValue({
      operationId: OP,
      projectId: orgScopedConnectionProjectId(),
    });
    gateMocks.beginAppConnectionChangeCommand.mockImplementation(async (input) => ({
      actor: requireUserActorForConnectionCommand(input.actor),
      gate: await gateMocks.runAppConnectionChangeGate({
        actor: requireUserActorForConnectionCommand(input.actor),
        organizationId: input.organizationId,
        requestId: input.requestId,
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      }),
    }));
  });

  it("orgScopedConnectionProjectId returns the org-scope sentinel", () => {
    expect(orgScopedConnectionProjectId()).toBe("");
  });

  it("requireUserActorForConnectionCommand rejects machine actors", () => {
    expect(() => requireUserActorForConnectionCommand(MACHINE_ACTOR)).toThrow(
      expect.objectContaining({ code: AUTH_ERROR_CODES.insufficientScope }),
    );
  });

  it("createAppConnectionCommand rejects machine actors before gate evaluation", async () => {
    await expect(
      createAppConnectionCommand({
        actor: MACHINE_ACTOR,
        organizationId: ORG,
        instanceId: "inst_test",
        appConnectionId: CONN,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        displayName: displayName("Cloudflare workers"),
        requestId: REQUEST,
        keyring: KEYRING,
        cloudflareBoundary: {
          allowedAccountId: "cf-account-123",
          allowedWorkerScript: "my-api-production",
        },
        tokenPlaintext: new TextEncoder().encode("token"),
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
    expect(gateMocks.runAppConnectionChangeGate).not.toHaveBeenCalled();
  });

  it("createAppConnectionCommand requires Cloudflare boundary flags", async () => {
    await expect(
      createAppConnectionCommand({
        actor: USER_ACTOR,
        organizationId: ORG,
        instanceId: "inst_test",
        appConnectionId: CONN,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        displayName: displayName("Cloudflare workers"),
        requestId: REQUEST,
        keyring: KEYRING,
        tokenPlaintext: new TextEncoder().encode("token"),
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
  });

  it("createAppConnectionCommand requires Cloudflare token input", async () => {
    await expect(
      createAppConnectionCommand({
        actor: USER_ACTOR,
        organizationId: ORG,
        instanceId: "inst_test",
        appConnectionId: CONN,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        displayName: displayName("Cloudflare workers"),
        requestId: REQUEST,
        keyring: KEYRING,
        cloudflareBoundary: {
          allowedAccountId: "cf-account-123",
          allowedWorkerScript: "my-api-production",
        },
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.credentialMissing });
  });

  it("createAppConnectionCommand requires GitHub boundary fields", async () => {
    await expect(
      createAppConnectionCommand({
        actor: USER_ACTOR,
        organizationId: ORG,
        instanceId: "inst_test",
        appConnectionId: CONN,
        provider: "github",
        connectionMethod: "github-app",
        displayName: displayName("GitHub Actions"),
        requestId: REQUEST,
        keyring: KEYRING,
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
  });

  it("createAppConnectionCommand rejects unsupported providers", async () => {
    await expect(
      createAppConnectionCommand({
        actor: USER_ACTOR,
        organizationId: ORG,
        instanceId: "inst_test",
        appConnectionId: CONN,
        provider: "vercel" as never,
        connectionMethod: "scoped-api-token",
        displayName: displayName("Vercel"),
        requestId: REQUEST,
        keyring: KEYRING,
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.invalidConnectionMethod });
  });

  it("rotateAppConnectionCredentialCommand requires token input when not dry-run", async () => {
    await expect(
      rotateAppConnectionCredentialCommand({
        actor: USER_ACTOR,
        organizationId: ORG,
        appConnectionId: CONN,
        requestId: REQUEST,
        dryRun: false,
        keyring: KEYRING,
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.credentialMissing });
    expect(gateMocks.runAppConnectionCredentialChangeGate).not.toHaveBeenCalled();
  });

  it("rotateAppConnectionCredentialCommand dry-run returns metadata-only projection", async () => {
    const projected = {
      connection: {
        id: CONN,
        organizationId: ORG,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        displayName: "Cloudflare workers",
        status: "active",
        statusReasonCode: null,
        hasActiveCredential: true,
        setupUserId: USER,
        lastValidationCheckedAt: null,
        lastValidationOutcome: null,
        lastValidationReasonCode: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      validation: {
        checkedAt: "2026-07-01T00:00:00.000Z",
        outcome: "success" as const,
        reasonCode: null,
        tokenStatus: "active" as const,
        workerScriptReachable: true,
        hasBoundaryWarning: false,
      },
    };
    vi.mocked(dryRunCloudflareCredentialRotation).mockResolvedValue(projected);

    const result = await rotateAppConnectionCredentialCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
      appConnectionId: CONN,
      requestId: REQUEST,
      dryRun: true,
      keyring: KEYRING,
    });

    expect(result.dryRun).toBe(true);
    expect(result.connection.id).toBe(CONN);
    expect(result.validation?.outcome).toBe("success");
    expect(gateMocks.runAppConnectionCredentialChangeGate).not.toHaveBeenCalled();
  });

  it("rotateAppConnectionCredentialCommand rotates credentials after gate success", async () => {
    const projected = {
      connection: {
        id: CONN,
        organizationId: ORG,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        displayName: "Cloudflare workers",
        status: "active",
        statusReasonCode: null,
        hasActiveCredential: true,
        setupUserId: USER,
        lastValidationCheckedAt: null,
        lastValidationOutcome: null,
        lastValidationReasonCode: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      validation: {
        checkedAt: "2026-07-01T00:00:00.000Z",
        outcome: "success" as const,
        reasonCode: null,
        tokenStatus: "active" as const,
        workerScriptReachable: true,
        hasBoundaryWarning: false,
      },
    };
    vi.mocked(rotateCloudflareScopedTokenCredential).mockResolvedValue({
      ...projected,
      auditEventId: "aud_test",
    });

    const result = await rotateAppConnectionCredentialCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
      appConnectionId: CONN,
      requestId: REQUEST,
      dryRun: false,
      keyring: KEYRING,
      tokenPlaintext: new TextEncoder().encode("rotated-token"),
    });

    expect(result.dryRun).toBe(false);
    expect(gateMocks.runAppConnectionCredentialChangeGate).toHaveBeenCalledOnce();
    expect(rotateCloudflareScopedTokenCredential).toHaveBeenCalledOnce();
  });

  it("listAppConnectionsCommand returns metadata-only rows", async () => {
    const row = {
      id: CONN,
      organizationId: ORG,
      provider: "cloudflare" as const,
      connectionMethod: "scoped-api-token" as const,
      displayName: displayName("Cloudflare workers"),
      status: "active" as const,
      setupUserId: USER,
      activeCredentialId: null,
      statusReasonCode: null,
      lastValidationCheckedAt: null,
      lastValidationOutcome: null,
      lastValidationReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) =>
      run({
        db: {} as never,
      }),
    );
    const listConnections = vi.fn(async () => [row]);
    const { TenantAppConnectionStore } = await import("@insecur/tenant-store");
    vi.mocked(TenantAppConnectionStore).mockImplementation(function MockStore() {
      return { listConnections } as never;
    });

    const connections = await listAppConnectionsCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
    });

    expect(connections).toHaveLength(1);
    expect(connections[0]?.id).toBe(CONN);
    expect(connections[0]).not.toHaveProperty("tokenUtf8");
    expect(listConnections).toHaveBeenCalledWith({ organizationId: ORG });
  });

  it("disconnectAppConnectionCommand returns metadata-only connection status", async () => {
    const disconnected = {
      id: CONN,
      organizationId: ORG,
      provider: "cloudflare" as const,
      connectionMethod: "scoped-api-token" as const,
      displayName: displayName("Cloudflare workers"),
      status: "disabled" as const,
      setupUserId: USER,
      activeCredentialId: null,
      statusReasonCode: "disconnected",
      lastValidationCheckedAt: null,
      lastValidationOutcome: null,
      lastValidationReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    vi.mocked(withOrgAppConnectionKeyring).mockImplementation(async (_input, run) =>
      run(
        {
          appConnectionStore: {} as never,
          sensitiveMetadataStore: {} as never,
          keyring: KEYRING,
        },
        {
          ...disconnected,
          status: "active",
        },
      ),
    );
    vi.mocked(disableCloudflareConnection).mockResolvedValue({
      connection: disconnected,
      auditEventId: "aud_test",
    });

    const result = await disconnectAppConnectionCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
      appConnectionId: CONN,
      requestId: REQUEST,
      keyring: KEYRING,
    });

    expect(result.connection.status).toBe("disabled");
    expect(result.connection).not.toHaveProperty("tokenUtf8");
    expect(disableCloudflareConnection).toHaveBeenCalledOnce();
  });

  it("getAppConnectionStatusCommand returns Cloudflare metadata and boundary", async () => {
    const connectionRow = {
      id: CONN,
      organizationId: ORG,
      provider: "cloudflare" as const,
      connectionMethod: "scoped-api-token" as const,
      displayName: displayName("Cloudflare workers"),
      status: "active" as const,
      setupUserId: USER,
      activeCredentialId: null,
      statusReasonCode: null,
      lastValidationCheckedAt: new Date("2026-07-01T00:00:00.000Z"),
      lastValidationOutcome: "success" as const,
      lastValidationReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    vi.mocked(withOrgAppConnectionKeyring).mockImplementation(async (_input, run) =>
      run(
        {
          appConnectionStore: {} as never,
          sensitiveMetadataStore: {} as never,
          keyring: KEYRING,
        },
        connectionRow,
      ),
    );
    vi.mocked(loadCloudflareConnectionBoundary).mockResolvedValue({
      allowedAccountId: "cf-account-123",
      allowedWorkerScript: "my-api-production",
    });

    const status = await getAppConnectionStatusCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
      appConnectionId: CONN,
      keyring: KEYRING,
    });

    expect(status.cloudflareBoundary?.allowedAccountId).toBe("cf-account-123");
    expect(status.githubBoundary).toBeNull();
    expect(status.connection.id).toBe(CONN);
  });

  it("getAppConnectionStatusCommand returns GitHub metadata and boundary", async () => {
    const connectionRow = {
      id: CONN,
      organizationId: ORG,
      provider: "github" as const,
      connectionMethod: "github-app" as const,
      displayName: displayName("GitHub Actions"),
      status: "active" as const,
      setupUserId: USER,
      activeCredentialId: null,
      statusReasonCode: null,
      lastValidationCheckedAt: new Date("2026-07-01T00:00:00.000Z"),
      lastValidationOutcome: "success" as const,
      lastValidationReasonCode: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    vi.mocked(withOrgAppConnectionKeyring).mockImplementation(async (_input, run) =>
      run(
        {
          appConnectionStore: {} as never,
          sensitiveMetadataStore: {} as never,
          keyring: KEYRING,
        },
        connectionRow,
      ),
    );
    vi.mocked(loadGitHubConnectionBoundary).mockResolvedValue({
      boundary: {
        installationId: "12345678",
        owner: "insecur-org",
        allowedRepositories: ["insecur-org/api", "insecur-org/web"],
      },
      linkage: {
        providerAccountId: "insecur-org",
        providerAppRegistrationId: "preg_test" as never,
      },
    });

    const status = await getAppConnectionStatusCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
      appConnectionId: CONN,
      keyring: KEYRING,
    });

    expect(status.githubBoundary?.allowedRepositoryCount).toBe(2);
    expect(status.cloudflareBoundary).toBeNull();
    expect(status.connection.provider).toBe("github");
  });

  it("reauthAppConnectionCommand forwards GitHub reauth through the gate", async () => {
    const projected = {
      connection: {
        id: CONN,
        organizationId: ORG,
        provider: "github",
        connectionMethod: "github-app",
        displayName: "GitHub Actions",
        status: "active",
        statusReasonCode: null,
        hasActiveCredential: true,
        setupUserId: USER,
        lastValidationCheckedAt: null,
        lastValidationOutcome: null,
        lastValidationReasonCode: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      validation: {
        checkedAt: "2026-07-01T00:00:00.000Z",
        outcome: "success" as const,
        reasonCode: null,
        installationStatus: "active" as const,
        accessibleRepositoryCount: 2,
        repositoriesWithinBoundary: true,
      },
      auditEventId: "aud_test",
    };
    vi.mocked(withOrgAppConnectionKeyring).mockImplementation(async (_input, run) =>
      run(
        {
          appConnectionStore: {} as never,
          sensitiveMetadataStore: {} as never,
          keyring: KEYRING,
        },
        {
          id: CONN,
          organizationId: ORG,
          provider: "github" as const,
          connectionMethod: "github-app" as const,
          displayName: displayName("GitHub Actions"),
          status: "active" as const,
          setupUserId: USER,
          activeCredentialId: null,
          statusReasonCode: null,
          lastValidationCheckedAt: null,
          lastValidationOutcome: null,
          lastValidationReasonCode: null,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ),
    );
    vi.mocked(reauthGitHubAppConnection).mockResolvedValue(projected);

    const result = await reauthAppConnectionCommand({
      actor: USER_ACTOR,
      organizationId: ORG,
      appConnectionId: CONN,
      requestId: REQUEST,
      keyring: KEYRING,
      githubBoundary: {
        installationId: "12345678",
        owner: "insecur-org",
        allowedRepositories: ["insecur-org/api"],
      },
    });

    expect(result.validation.outcome).toBe("success");
    expect(gateMocks.runAppConnectionChangeGate).toHaveBeenCalledOnce();
    expect(reauthGitHubAppConnection).toHaveBeenCalledOnce();
  });
});
