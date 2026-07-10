import {
  APP_CONNECTION_ERROR_CODES,
  AUTH_ERROR_CODES,
  CLI_ERROR_CODES,
  organizationId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import { runConnectionsCreateCommand } from "../src/commands/connections-create.js";
import { runConnectionsDisconnectCommand } from "../src/commands/connections-disconnect.js";
import { runConnectionsListCommand } from "../src/commands/connections-list.js";
import { runConnectionsReauthCommand } from "../src/commands/connections-reauth.js";
import { runConnectionsRotateCommand } from "../src/commands/connections-rotate.js";
import { runConnectionsStatusCommand } from "../src/commands/connections-status.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { EXIT_STEP_UP } from "../src/output/exit-codes.js";

const ORG_ID = organizationId.brand("org_00000000000000000000000001");
const CONNECTION_ID = "conn_00000000000000000000000001";

const context: ResolvedCliContext = {
  scope: {
    host: "https://insecur.test",
    orgId: ORG_ID,
    projectId: undefined,
    envId: undefined,
    profileSlug: undefined,
    profileId: undefined,
    configDir: "/tmp",
  },
  configPath: "/tmp/.insecur.json",
};

const metadataOnlyConnection = {
  id: CONNECTION_ID,
  organizationId: ORG_ID,
  provider: "cloudflare",
  connectionMethod: "scoped-api-token",
  displayName: "Cloudflare workers",
  status: "active",
  statusReasonCode: null,
  hasActiveCredential: true,
  setupUserId: "usr_00000000000000000000000001",
  lastValidationCheckedAt: "2026-07-01T00:00:00.000Z",
  lastValidationOutcome: "success",
  lastValidationReasonCode: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAppConnections: vi.fn(),
    getAppConnectionStatus: vi.fn(),
    createAppConnection: vi.fn(),
    rotateAppConnectionCredential: vi.fn(),
    reauthAppConnection: vi.fn(),
    disconnectAppConnection: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

vi.mock("../src/auth/require-session.js", () => ({
  requireSessionCredential: vi.fn(async () => "test-credential"),
}));

vi.mock("../src/input/read-display-name-stdin.js", () => ({
  readDisplayNameFromStdin: vi.fn(async () => "Cloudflare workers"),
}));

vi.mock("../src/input/collect-secret-value.js", () => ({
  collectSecretValue: vi.fn(async () => ({
    inputMode: "stdin" as const,
    valueUtf8: new TextEncoder().encode("scoped-token-value"),
  })),
}));

describe("connections CLI commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list --json returns metadata-only payloads without provider credentials", async () => {
    const api = createMockApi({
      listAppConnections: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: { connections: [metadataOnlyConnection] },
        },
      })),
    });

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitCode = await runConnectionsListCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
    );
    expect(exitCode).toBe(0);
    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain('"connections"');
    expect(output).not.toContain("tokenUtf8");
    expect(output).not.toContain("encodedValueUtf8");
    expect(output).not.toContain("providerCredential");
    stdout.mockRestore();
  });

  it("status --json returns metadata-only payloads without provider credentials", async () => {
    const api = createMockApi({
      getAppConnectionStatus: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            connection: metadataOnlyConnection,
            validation: { outcome: "success" },
            cloudflareBoundary: {
              allowedAccountId: "cf-account-123",
              allowedWorkerScript: "my-api-production",
            },
            githubBoundary: null,
          },
        },
      })),
    });

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitCode = await runConnectionsStatusCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
      CONNECTION_ID,
    );
    expect(exitCode).toBe(0);
    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain('"cloudflareBoundary"');
    expect(output).not.toContain("tokenUtf8");
    expect(output).not.toContain("encodedValueUtf8");
    stdout.mockRestore();
  });

  it("create rejects --token on argv", async () => {
    const api = createMockApi();
    await expect(
      runConnectionsCreateCommand({ json: false, quiet: false, verbose: false }, api, context, {
        provider: "cloudflare",
        connectionId: CONNECTION_ID,
        method: "scoped-api-token",
        displayNameStdin: true,
        operationId: undefined,
        valueStdin: false,
        token: "secret-on-argv",
        allowAccountId: "cf-account-123",
        allowWorkerScript: "my-api-production",
        installationId: undefined,
        owner: undefined,
        allowedRepositories: undefined,
      }),
    ).rejects.toMatchObject({ code: CLI_ERROR_CODES.validationError });
    expect(api.createAppConnection).not.toHaveBeenCalled();
  });

  it("create requires Cloudflare boundary flags before calling the API", async () => {
    const api = createMockApi();
    await expect(
      runConnectionsCreateCommand({ json: false, quiet: false, verbose: false }, api, context, {
        provider: "cloudflare",
        connectionId: CONNECTION_ID,
        method: "scoped-api-token",
        displayNameStdin: true,
        operationId: undefined,
        valueStdin: true,
        token: undefined,
        allowAccountId: undefined,
        allowWorkerScript: undefined,
        installationId: undefined,
        owner: undefined,
        allowedRepositories: undefined,
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
    expect(api.createAppConnection).not.toHaveBeenCalled();
  });

  it("create calls the org-scoped connections path via the API client", async () => {
    const api = createMockApi({
      createAppConnection: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            connection: metadataOnlyConnection,
            validation: { outcome: "success" },
            auditEventId: "aud_00000000000000000000000001",
          },
        },
      })),
    });

    const exitCode = await runConnectionsCreateCommand(
      { json: false, quiet: false, verbose: false },
      api,
      context,
      {
        provider: "cloudflare",
        connectionId: CONNECTION_ID,
        method: "scoped-api-token",
        displayNameStdin: true,
        operationId: "op_00000000000000000000000001",
        valueStdin: true,
        token: undefined,
        allowAccountId: "cf-account-123",
        allowWorkerScript: "my-api-production",
        installationId: undefined,
        owner: undefined,
        allowedRepositories: undefined,
      },
    );
    expect(exitCode).toBe(0);
    expect(api.createAppConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        appConnectionId: CONNECTION_ID,
        provider: "cloudflare",
        connectionMethod: "scoped-api-token",
        allowAccountId: "cf-account-123",
        allowWorkerScript: "my-api-production",
      }),
    );
  });

  it("create returns step-up exit code when high-assurance challenge is required (agent hand-off)", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const api = createMockApi({
      createAppConnection: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 403,
        envelope: {
          ok: false as const,
          error: {
            code: AUTH_ERROR_CODES.highAssuranceRequired,
            message: "high-assurance challenge required",
            retryable: false,
          },
          meta: { operationId: "op_00000000000000000000000001" },
        },
      })),
    });

    const exitCode = await runConnectionsCreateCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
      {
        provider: "cloudflare",
        connectionId: CONNECTION_ID,
        method: "scoped-api-token",
        displayNameStdin: true,
        operationId: undefined,
        valueStdin: true,
        token: undefined,
        allowAccountId: "cf-account-123",
        allowWorkerScript: "my-api-production",
        installationId: undefined,
        owner: undefined,
        allowedRepositories: undefined,
      },
    );
    expect(exitCode).toBe(EXIT_STEP_UP);
    const output = JSON.parse(String(stderr.mock.calls[0]?.[0])) as {
      next: { id: string; actor: string; argv: string[] }[];
    };
    expect(output.next.at(-1)).toMatchObject({
      id: "resume",
      actor: "human",
      argv: expect.arrayContaining([
        "connections",
        "create",
        "cloudflare",
        "--operation",
        "op_00000000000000000000000001",
      ]),
    });
    stderr.mockRestore();
  });

  it("rotate --dry-run calls the org-scoped rotate path", async () => {
    const api = createMockApi({
      rotateAppConnectionCredential: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            dryRun: true,
            connection: metadataOnlyConnection,
            validation: null,
            auditEventId: null,
          },
        },
      })),
    });

    const exitCode = await runConnectionsRotateCommand(
      { json: false, quiet: false, verbose: false },
      api,
      context,
      {
        connectionId: CONNECTION_ID,
        dryRun: true,
        operationId: undefined,
        valueStdin: false,
        token: undefined,
      },
    );
    expect(exitCode).toBe(0);
    expect(api.rotateAppConnectionCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        appConnectionId: CONNECTION_ID,
        dryRun: true,
      }),
    );
  });

  it("rotate rejects --token on argv", async () => {
    const api = createMockApi();
    await expect(
      runConnectionsRotateCommand({ json: false, quiet: false, verbose: false }, api, context, {
        connectionId: CONNECTION_ID,
        dryRun: false,
        operationId: undefined,
        valueStdin: false,
        token: "secret-on-argv",
      }),
    ).rejects.toMatchObject({ code: CLI_ERROR_CODES.validationError });
  });

  it("reauth rejects partial GitHub boundary override before calling the API", async () => {
    const api = createMockApi();
    await expect(
      runConnectionsReauthCommand({ json: false, quiet: false, verbose: false }, api, context, {
        connectionId: CONNECTION_ID,
        operationId: undefined,
        installationId: undefined,
        owner: undefined,
        allowedRepositories: "insecur-org/api",
      }),
    ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
    expect(api.reauthAppConnection).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing installationId",
      installationId: undefined,
      owner: "insecur-org",
      allowedRepositories: "insecur-org/api",
    },
    {
      label: "missing owner",
      installationId: "12345678",
      owner: undefined,
      allowedRepositories: "insecur-org/api",
    },
    {
      label: "missing allowedRepositories",
      installationId: "12345678",
      owner: "insecur-org",
      allowedRepositories: undefined,
    },
  ])(
    "reauth rejects partial GitHub boundary override when $label is missing",
    async ({ installationId, owner, allowedRepositories }) => {
      const api = createMockApi();
      await expect(
        runConnectionsReauthCommand({ json: false, quiet: false, verbose: false }, api, context, {
          connectionId: CONNECTION_ID,
          operationId: undefined,
          installationId,
          owner,
          allowedRepositories,
        }),
      ).rejects.toMatchObject({ code: APP_CONNECTION_ERROR_CODES.boundaryMismatch });
      expect(api.reauthAppConnection).not.toHaveBeenCalled();
    },
  );

  it("reauth calls the org-scoped reauth path", async () => {
    const api = createMockApi({
      reauthAppConnection: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            connection: metadataOnlyConnection,
            validation: { outcome: "success" },
            auditEventId: "aud_reauth",
          },
        },
      })),
    });

    const exitCode = await runConnectionsReauthCommand(
      { json: false, quiet: false, verbose: false },
      api,
      context,
      {
        connectionId: CONNECTION_ID,
        operationId: "op_00000000000000000000000001",
        installationId: "12345678",
        owner: "insecur-org",
        allowedRepositories: "insecur-org/api",
      },
    );
    expect(exitCode).toBe(0);
    expect(api.reauthAppConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        appConnectionId: CONNECTION_ID,
        installationId: "12345678",
        owner: "insecur-org",
        allowedRepositories: ["insecur-org/api"],
      }),
    );
  });

  it("disconnect calls the org-scoped disconnect path", async () => {
    const api = createMockApi({
      disconnectAppConnection: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            connection: { ...metadataOnlyConnection, status: "disabled" },
            auditEventId: "aud_disconnect",
          },
        },
      })),
    });

    const exitCode = await runConnectionsDisconnectCommand(
      { json: false, quiet: false, verbose: false },
      api,
      context,
      CONNECTION_ID,
    );
    expect(exitCode).toBe(0);
    expect(api.disconnectAppConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        appConnectionId: CONNECTION_ID,
      }),
    );
  });
});
