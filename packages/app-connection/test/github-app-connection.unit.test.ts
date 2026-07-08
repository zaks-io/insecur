import {
  APP_CONNECTION_ERROR_CODES,
  appConnectionId,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  providerAppRegistrationId,
  userId,
} from "@insecur/domain";
import { createKeyring } from "@insecur/crypto";
import type { AppConnectionRow } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitHubAppInstallationPort } from "../src/github-app-port.js";
import type { LoadedGitHubConnectionMetadata } from "../src/load-github-connection-boundary.js";

const { requireAppConnectionChangeEvidence } = vi.hoisted(() => ({
  requireAppConnectionChangeEvidence: vi.fn(async () => undefined),
}));

const githubAccessMocks = vi.hoisted(() => ({
  withGitHubConnectionManageAccess: vi.fn(),
  withGitHubConnectionReadAccess: vi.fn(),
}));

vi.mock("../src/consume-app-connection-change-evidence.js", () => ({
  requireAppConnectionChangeEvidence,
}));

vi.mock("../src/assert-create-connection-manage-access.js", () => ({
  assertCreateConnectionManageAccess: vi.fn(async () => undefined),
}));

vi.mock("../src/with-github-connection-access.js", () => ({
  withGitHubConnectionManageAccess: githubAccessMocks.withGitHubConnectionManageAccess,
  withGitHubConnectionReadAccess: githubAccessMocks.withGitHubConnectionReadAccess,
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { createGitHubAppConnection } from "../src/create-github-app-connection.js";
import { updateGitHubAppConnection } from "../src/update-github-app-connection.js";
import { validateGitHubAppConnection } from "../src/validate-github-app-connection.js";
import { disableGitHubConnection } from "../src/disable-github-connection.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_01JZ8GHOP2R7M4T0V9X3C5D8F1");
const CONN = appConnectionId.brand("conn_01JZ8GH12R7M4T0V9X3C5D8F1G");
const REG = providerAppRegistrationId.brand("preg_01JZ8GHRE2R7M4T0V9X3C5D8F1");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };
const BOUNDARY = {
  installationId: "12345678",
  owner: "insecur-org",
  allowedRepositories: ["insecur-org/api", "insecur-org/web"],
} as const;

function testDisplayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

function activeConnectionRow(): AppConnectionRow {
  return {
    id: CONN,
    organizationId: ORG,
    provider: "github",
    connectionMethod: "github-app",
    displayName: testDisplayName("GitHub Actions"),
    status: "active",
    setupUserId: ACTOR.userId,
    activeCredentialId: null,
    statusReasonCode: null,
    lastValidationCheckedAt: new Date("2026-07-01T00:00:00.000Z"),
    lastValidationOutcome: "success",
    lastValidationReasonCode: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  };
}

function loadedMetadata(boundary = BOUNDARY): LoadedGitHubConnectionMetadata {
  return {
    boundary,
    linkage: {
      providerAccountId: boundary.owner,
      providerAppRegistrationId: REG,
    },
  };
}

function successfulGitHubPort(): GitHubAppInstallationPort {
  return {
    verifyInstallation: vi.fn(async () => ({
      installationStatus: "active" as const,
      accessibleRepositoryCount: BOUNDARY.allowedRepositories.length,
      repositoriesWithinBoundary: true,
    })),
  };
}

describe("github app connection unit flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubAccessMocks.withGitHubConnectionManageAccess.mockReset();
    githubAccessMocks.withGitHubConnectionReadAccess.mockReset();
  });

  it("creates a GitHub connection through encrypted metadata storage", async () => {
    const githubPort = successfulGitHubPort();
    const activated = activeConnectionRow();
    const upsertField = vi.fn(async () => undefined);

    const result = await createGitHubAppConnection({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      instanceId: "inst_test",
      operationId: OP,
      appConnectionId: CONN,
      providerAppRegistrationId: REG,
      displayName: testDisplayName("GitHub Actions"),
      setupUserId: ACTOR.userId,
      boundary: BOUNDARY,
      keyring: createKeyring(new Uint8Array(32).fill(9)),
      githubPort,
      appConnectionStore: {
        createConnection: vi.fn(async () => undefined),
        updateConnectionValidation: vi.fn(async () => activated),
      } as never,
      providerAppRegistrationStore: {
        getRegistration: vi.fn(async () => ({
          id: REG,
          status: "configured",
        })),
      } as never,
      sensitiveMetadataStore: {
        upsertField,
      } as never,
    });

    expect(result.connection.status).toBe("active");
    expect(result.validation.outcome).toBe("success");
    expect(githubPort.verifyInstallation).toHaveBeenCalledOnce();
    expect(upsertField).toHaveBeenCalled();
    expect(JSON.stringify(result.validation)).not.toContain("insecur-org/api");
  });

  it("rejects wildcard repository boundaries before provider validation", async () => {
    const githubPort = successfulGitHubPort();

    await expect(
      createGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        instanceId: "inst_test",
        operationId: OP,
        appConnectionId: CONN,
        providerAppRegistrationId: REG,
        displayName: testDisplayName("Wildcard GitHub"),
        setupUserId: ACTOR.userId,
        boundary: {
          ...BOUNDARY,
          allowedRepositories: ["insecur-org/*"],
        },
        keyring: createKeyring(new Uint8Array(32).fill(9)),
        githubPort,
        appConnectionStore: {
          createConnection: vi.fn(),
          updateConnectionValidation: vi.fn(),
        } as never,
        providerAppRegistrationStore: {
          getRegistration: vi.fn(async () => ({
            id: REG,
            status: "configured",
          })),
        } as never,
        sensitiveMetadataStore: {
          upsertField: vi.fn(),
        } as never,
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });

    expect(githubPort.verifyInstallation).not.toHaveBeenCalled();
  });

  it("updates an active connection and re-validates against the provider port", async () => {
    const githubPort = successfulGitHubPort();
    const connection = activeConnectionRow();
    const updatedBoundary = {
      ...BOUNDARY,
      allowedRepositories: ["insecur-org/api", "insecur-org/docs"],
    };

    githubAccessMocks.withGitHubConnectionManageAccess.mockImplementation(async (input) =>
      input.run(connection, loadedMetadata(updatedBoundary)),
    );

    const validation = await updateGitHubAppConnection({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      appConnectionId: CONN,
      boundary: updatedBoundary,
      keyring: createKeyring(new Uint8Array(32).fill(9)),
      githubPort,
      appConnectionStore: {
        updateConnectionValidation: vi.fn(async () => connection),
      } as never,
      sensitiveMetadataStore: {
        upsertField: vi.fn(async () => undefined),
      } as never,
    });

    expect(validation.outcome).toBe("success");
    expect(githubPort.verifyInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedRepositories: updatedBoundary.allowedRepositories,
      }),
    );
  });

  it("validates an active connection using stored metadata", async () => {
    const githubPort = successfulGitHubPort();
    const connection = activeConnectionRow();

    githubAccessMocks.withGitHubConnectionReadAccess.mockImplementation(async (input) =>
      input.run(connection, loadedMetadata()),
    );

    const validation = await validateGitHubAppConnection({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      appConnectionId: CONN,
      keyring: createKeyring(new Uint8Array(32).fill(9)),
      githubPort,
      appConnectionStore: {
        updateConnectionValidation: vi.fn(async () => connection),
      } as never,
      sensitiveMetadataStore: {
        getField: vi.fn(),
      } as never,
    });

    expect(validation.outcome).toBe("success");
    expect(githubPort.verifyInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: BOUNDARY.installationId,
        allowedRepositories: BOUNDARY.allowedRepositories,
      }),
    );
  });

  it("rejects updates for disconnected connections", async () => {
    const connection = { ...activeConnectionRow(), status: "disconnected" as const };
    githubAccessMocks.withGitHubConnectionManageAccess.mockImplementation(async (input) =>
      input.run(connection, loadedMetadata()),
    );

    await expect(
      updateGitHubAppConnection({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        operationId: OP,
        appConnectionId: CONN,
        boundary: BOUNDARY,
        keyring: createKeyring(new Uint8Array(32).fill(9)),
        githubPort: successfulGitHubPort(),
        appConnectionStore: {
          updateConnectionValidation: vi.fn(),
        } as never,
        sensitiveMetadataStore: {
          upsertField: vi.fn(),
        } as never,
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.disconnected });
  });

  it("disables an active GitHub connection", async () => {
    const connection = activeConnectionRow();
    githubAccessMocks.withGitHubConnectionManageAccess.mockImplementation(async (input) =>
      input.run(connection, loadedMetadata()),
    );

    const disabled = { ...connection, status: "disconnected" as const };
    const updateConnectionStatus = vi.fn(async () => disabled);

    const result = await disableGitHubConnection({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      appConnectionId: CONN,
      keyring: createKeyring(new Uint8Array(32).fill(9)),
      appConnectionStore: {
        updateConnectionStatus,
      } as never,
      sensitiveMetadataStore: {
        upsertField: vi.fn(),
      } as never,
    });

    expect(result.connection.status).toBe("disconnected");
    expect(result.auditEventId).toBe("aud_test");
    expect(updateConnectionStatus).toHaveBeenCalledOnce();
  });
});
