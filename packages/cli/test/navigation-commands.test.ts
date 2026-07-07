import { afterEach, describe, expect, it, vi } from "vitest";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";

const inputMocks = vi.hoisted(() => ({
  readStdinBytes: vi.fn(),
}));

vi.mock("../src/input/read-stdin.js", () => ({
  readStdinBytes: inputMocks.readStdinBytes,
}));

import { runEnvsCreateCommand } from "../src/commands/envs-create.js";
import { runProjectsCreateCommand } from "../src/commands/projects-create.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { CliError } from "../src/output/cli-error.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST00000000000000000001";
const SOURCE_ENV_ID = "env_01TEST00000000000000000002";

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

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient {
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
    listSessionOrganizations: async () => {
      throw new Error("not used");
    },
    listProjects: async () => {
      throw new Error("not used");
    },
    createProject: vi.fn(async () => ({
      ok: true as const,
      envelope: {
        ok: true as const,
        data: {
          projectId: PROJECT_ID as never,
          organizationId: ORG_ID as never,
          displayName: "Created project" as never,
          createdAt: "2026-06-24T00:00:00.000Z",
        },
      },
    })),
    listEnvironments: async () => {
      throw new Error("not used");
    },
    createEnvironment: vi.fn(async () => ({
      ok: true as const,
      envelope: {
        ok: true as const,
        data: {
          environmentId: ENV_ID as never,
          organizationId: ORG_ID as never,
          projectId: PROJECT_ID as never,
          displayName: "Created env" as never,
          lifecycleStage: "development",
          isProtected: false,
          createdAt: "2026-06-24T00:00:00.000Z",
          copiedShapeCount: 2,
        },
      },
    })),
    ...overrides,
  };
}

describe("navigation create commands", () => {
  afterEach(() => {
    clearMemorySession();
    vi.restoreAllMocks();
    inputMocks.readStdinBytes.mockReset();
  });

  it("projects create sends opaque id and stdin display name separately", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    inputMocks.readStdinBytes.mockResolvedValue(new TextEncoder().encode("Created project\n"));
    const api = createMockApi();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runProjectsCreateCommand(flags, api, mockContext, {
      projectId: PROJECT_ID,
      displayNameStdin: true,
    });

    expect(exitCode).toBe(0);
    expect(api.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        displayName: "Created project",
      }),
    );
    expect(String(stdout.mock.calls[0]?.[0] ?? "")).toContain(PROJECT_ID);
  });

  it("envs create forwards copy-shapes-from-env-id without secret values", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    inputMocks.readStdinBytes.mockResolvedValue(new TextEncoder().encode("Created env"));
    const api = createMockApi();

    await runEnvsCreateCommand(flags, api, mockContext, {
      envId: ENV_ID,
      displayNameStdin: true,
      copyShapesFromEnvId: SOURCE_ENV_ID,
    });

    expect(api.createEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: ENV_ID,
        displayName: "Created env",
        copyShapesFromEnvironmentId: SOURCE_ENV_ID,
      }),
    );
  });

  it("requires --display-name-stdin for projects create", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runProjectsCreateCommand(flags, api, mockContext, {
        projectId: PROJECT_ID,
        displayNameStdin: false,
      }),
    ).rejects.toBeInstanceOf(CliError);

    await expect(
      runProjectsCreateCommand(flags, api, mockContext, {
        projectId: PROJECT_ID,
        displayNameStdin: false,
      }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
  });
});
