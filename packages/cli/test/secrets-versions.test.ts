import { afterEach, describe, expect, it, vi } from "vitest";
import { SECRET_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";

import { runSecretsVersionsCommand } from "../src/commands/secrets-versions.js";
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
): ApiClient & { listSecretVersions: ReturnType<typeof vi.fn> } {
  const listSecretVersions = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        secretId: SECRET_ID,
        variableKey: "API_KEY",
        versions: [
          {
            secretVersionId: VERSION_ID,
            versionNumber: 1,
            lifecycleState: "live" as const,
            createdAt: "2026-01-01T00:00:00.000Z",
            isCurrent: true,
            isPublished: true,
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
    listEnvironmentSecrets: async () => {
      throw new Error("not used");
    },
    listSecretVersions,
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

describe("runSecretsVersionsCommand", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
  });

  it("calls the env-scoped versions route and emits metadata-only JSON", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi();

    const exitCode = await runSecretsVersionsCommand(
      { flags, api, context: mockContext },
      { secretId: SECRET_ID },
    );

    expect(exitCode).toBe(0);
    expect(api.listSecretVersions).toHaveBeenCalledWith({
      host: flags.host,
      bearerCredential: "credential_test",
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      environmentId: ENV_ID,
      secretId: SECRET_ID,
    });
    const output = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    expect(output.ok).toBe(true);
    expect(output.data.versions).toHaveLength(1);
    expect(output.data.versions[0]).toMatchObject({
      secretVersionId: VERSION_ID,
      isCurrent: true,
      isPublished: true,
    });
    expect(JSON.stringify(output)).not.toMatch(/valueUtf8|plaintext|password|wrapped|ciphertext/i);
  });

  it("rejects invalid secret ids before calling the API", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runSecretsVersionsCommand({ flags, api, context: mockContext }, { secretId: "not-a-secret" }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
    expect(api.listSecretVersions).not.toHaveBeenCalled();
  });

  it("surfaces coordinate-invalid secret lookups", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi({
      listSecretVersions: vi.fn(async () => ({
        ok: false as const,
        envelope: {
          ok: false as const,
          error: {
            code: SECRET_ERROR_CODES.coordinateInvalid,
            message: "secret not found",
            retryable: false,
          },
        },
        httpStatus: 404,
      })),
    });

    await expect(
      runSecretsVersionsCommand({ flags, api, context: mockContext }, { secretId: SECRET_ID }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.coordinateInvalid,
    });
  });
});
