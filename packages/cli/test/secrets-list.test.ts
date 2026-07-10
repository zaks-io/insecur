import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, CLI_ERROR_CODES } from "@insecur/domain";

import { runSecretsListCommand } from "../src/commands/secrets-list.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST0000000000000000001";
const SECRET_ID = "sec_01TEST00000000000000000001";
const VERSION_ID = "sv_01TEST00000000000000000001";

const flags = {
  host: "https://insecur.test",
  orgId: ORG_ID as never,
  projectId: PROJECT_ID as never,
  envId: ENV_ID as never,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const mockContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
  scope: {
    host: flags.host,
    orgId: ORG_ID as never,
    projectId: PROJECT_ID as never,
    envId: ENV_ID as never,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

function createMockApi(
  overrides: Partial<ApiClient> = {},
): ApiClient & { listEnvironmentSecrets: ReturnType<typeof vi.fn> } {
  const listEnvironmentSecrets = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        secrets: [
          {
            secretId: SECRET_ID,
            variableKey: "API_KEY",
            displayName: "API_KEY",
            currentVersion: {
              secretVersionId: VERSION_ID,
              versionNumber: 1,
              lifecycleState: "live" as const,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      meta: { requestId: "req_test" as never },
    },
  }));
  return {
    createCliAuthorizationUrl: () => "https://insecur.test/v1/auth/cli/authorize",
    exchangeCliPkceSession: async () => {
      throw new Error("not used");
    },
    provisionPersonalOrganization: async () => {
      throw new Error("not used");
    },
    writeSecretByVariableKey: async () => {
      throw new Error("not used");
    },
    listEnvironmentSecrets,
    listSecretVersions: async () => {
      throw new Error("not used");
    },
    issueInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrantAll: async () => {
      throw new Error("not used");
    },
    recordInjectionRunCompleted: async () => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("runSecretsListCommand", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
  });

  it("calls the env-scoped secrets list route and emits metadata-only JSON", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi();

    const exitCode = await runSecretsListCommand({ flags, api, context: mockContext });

    expect(exitCode).toBe(0);
    expect(api.listEnvironmentSecrets).toHaveBeenCalledWith({
      host: flags.host,
      bearerCredential: "credential_test",
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      environmentId: ENV_ID,
    });
    const output = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    expect(output.ok).toBe(true);
    expect(output.data.secrets).toHaveLength(1);
    expect(output.data.secrets[0]).toMatchObject({
      secretId: SECRET_ID,
      variableKey: "API_KEY",
    });
    expect(JSON.stringify(output)).not.toMatch(/valueUtf8|plaintext|password|wrapped|ciphertext/i);
  });

  it("gives an agent an exact discovery action when the list is empty", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi({
      listEnvironmentSecrets: vi.fn(async () => ({
        ok: true as const,
        envelope: { ok: true as const, data: { secrets: [] } },
      })),
    });

    await runSecretsListCommand({ flags, api, context: mockContext });

    const output = JSON.parse(String(stdout.mock.calls[0]?.[0])) as { next: unknown[] };
    expect(output.next).toEqual([
      {
        id: "describe-create",
        kind: "execute",
        actor: "agent",
        argv: ["insecur", "describe", "secrets", "set", "--json"],
      },
    ]);
  });

  it("requires org, project, and environment scope", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const contextWithoutEnv: ResolvedCliContext = {
      ...mockContext,
      scope: { ...mockContext.scope, envId: undefined },
    };

    await expect(
      runSecretsListCommand({ flags, api, context: contextWithoutEnv }),
    ).rejects.toMatchObject({
      code: CLI_ERROR_CODES.parentScopeUnresolved,
    });
    expect(api.listEnvironmentSecrets).not.toHaveBeenCalled();
  });

  it("surfaces API auth failures", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi({
      listEnvironmentSecrets: vi.fn(async () => ({
        ok: false as const,
        envelope: {
          ok: false as const,
          error: {
            code: AUTH_ERROR_CODES.insufficientScope,
            message: "denied",
            retryable: false,
          },
        },
        httpStatus: 403,
      })),
    });

    await expect(runSecretsListCommand({ flags, api, context: mockContext })).rejects.toMatchObject(
      {
        code: AUTH_ERROR_CODES.insufficientScope,
      },
    );
  });
});
