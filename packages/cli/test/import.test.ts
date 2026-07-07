import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  IMPORT_ERROR_CODES,
  SECRET_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";

const confirmMocks = vi.hoisted(() => ({
  readConfirmPrompt: vi.fn(),
}));

vi.mock("../src/input/confirm-prompt.js", () => ({
  readConfirmPrompt: confirmMocks.readConfirmPrompt,
}));
import { runImportCommand } from "../src/commands/import.js";
import { runLocalFilesRmCommand } from "../src/commands/local-files-rm.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST0000000000000000001";
const STAGING_ENV_ID = "env_01TEST0000000000000000002";
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

function developmentEnvironment(
  environmentId: string,
  lifecycleStage: string,
  isProtected: boolean,
) {
  return {
    environmentId: environmentId as never,
    organizationId: ORG_ID as never,
    projectId: PROJECT_ID as never,
    displayName: "Environment" as never,
    lifecycleStage,
    isProtected,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient & {
  writeSecretByVariableKey: ReturnType<typeof vi.fn>;
  listProjectSecrets: ReturnType<typeof vi.fn>;
  listEnvironments: ReturnType<typeof vi.fn>;
} {
  const writeSecretByVariableKey = vi.fn(async (input: { variableKey: string }) => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        secretId: SECRET_ID,
        secretVersionId: VERSION_ID,
        variableKey: input.variableKey,
        createdSecretShape: true,
        auditEventId: "aud_01TEST00000000000000000001",
      },
      meta: { requestId: "req_test" as never },
    },
  }));
  const listEnvironments = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        environments: [
          developmentEnvironment(ENV_ID, ENVIRONMENT_LIFECYCLE_STAGES.development, false),
          developmentEnvironment(STAGING_ENV_ID, ENVIRONMENT_LIFECYCLE_STAGES.staging, true),
        ],
      },
    },
  }));
  const listProjectSecrets = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        environments: [
          developmentEnvironment(ENV_ID, ENVIRONMENT_LIFECYCLE_STAGES.development, false),
        ],
        rows: [],
      },
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
    writeSecretByVariableKey,
    listProjectSecrets,
    listEnvironments,
    listSessionOrganizations: async () => {
      throw new Error("not used");
    },
    listProjects: async () => {
      throw new Error("not used");
    },
    createProject: async () => {
      throw new Error("not used");
    },
    createEnvironment: async () => {
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
    getOperation: async () => {
      throw new Error("not used");
    },
    cancelOperation: async () => {
      throw new Error("not used");
    },
    listAuditEvents: async () => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("runImportCommand", () => {
  let fixtureDir: string;
  let envFilePath: string;

  afterEach(async () => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
    if (envFilePath !== undefined) {
      await unlink(envFilePath).catch(() => undefined);
    }
  });

  async function writeEnvFile(content: string): Promise<string> {
    fixtureDir = await mkdtemp(join(tmpdir(), "insecur-import-fixture-"));
    envFilePath = join(fixtureDir, ".env");
    await writeFile(envFilePath, content, "utf8");
    return envFilePath;
  }

  it("imports all parsed secrets after successful preflight", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi();
    const filePath = await writeEnvFile("API_KEY=alpha\nOTHER_KEY=beta\n");

    const exitCode = await runImportCommand(flags, api, mockContext, {
      filePath,
      dryRun: false,
    });

    expect(exitCode).toBe(0);
    expect(api.writeSecretByVariableKey).toHaveBeenCalledTimes(2);
    const serialized = JSON.stringify(JSON.parse(stdout.mock.calls[0]?.[0] as string));
    expect(serialized).not.toContain("alpha");
    expect(serialized).not.toContain("beta");
    stdout.mockRestore();
  });

  it("returns a metadata-only Secret Import Plan for dry-run without writes", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi();
    const filePath = await writeEnvFile("API_KEY=alpha\n");

    const exitCode = await runImportCommand(flags, api, mockContext, {
      filePath,
      dryRun: true,
    });

    expect(exitCode).toBe(0);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
    const parsed: unknown = JSON.parse(stdout.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        plan: expect.objectContaining({
          dryRun: true,
          ready: true,
          writeCount: 1,
          validFinalVariableKeys: ["API_KEY"],
        }),
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("alpha");
    stdout.mockRestore();
  });

  it("rejects protected or non-development environments before parsing", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const filePath = "/should-not-be-read/.env";
    const stagingContext: ResolvedCliContext = {
      ...mockContext,
      scope: { ...mockContext.scope, envId: STAGING_ENV_ID as never },
    };

    await expect(
      runImportCommand(flags, api, stagingContext, { filePath, dryRun: false }),
    ).rejects.toMatchObject({
      code: IMPORT_ERROR_CODES.unsupportedEnvironment,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
    expect(api.listProjectSecrets).not.toHaveBeenCalled();
  });

  it("fails all-or-nothing when an existing secret conflicts", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi({
      listProjectSecrets: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            environments: [
              developmentEnvironment(ENV_ID, ENVIRONMENT_LIFECYCLE_STAGES.development, false),
            ],
            rows: [
              {
                variableKey: "API_KEY" as never,
                cells: [
                  { environmentId: ENV_ID as never, present: true, secretId: SECRET_ID as never },
                ],
              },
            ],
          },
        },
      })),
    });
    const filePath = await writeEnvFile("API_KEY=alpha\nOTHER_KEY=beta\n");

    await expect(
      runImportCommand(flags, api, mockContext, { filePath, dryRun: false }),
    ).rejects.toMatchObject({
      code: IMPORT_ERROR_CODES.existingSecret,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("prints metadata-only preflight issues in human mode", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi({
      listProjectSecrets: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            environments: [
              developmentEnvironment(ENV_ID, ENVIRONMENT_LIFECYCLE_STAGES.development, false),
            ],
            rows: [
              {
                variableKey: "API_KEY" as never,
                cells: [
                  { environmentId: ENV_ID as never, present: true, secretId: SECRET_ID as never },
                ],
              },
            ],
          },
        },
      })),
    });
    const filePath = await writeEnvFile("API_KEY=alpha\nOTHER_KEY=beta\n");
    const humanFlags = { ...flags, json: false, quiet: false };

    await expect(
      runImportCommand(humanFlags, api, mockContext, { filePath, dryRun: false }),
    ).rejects.toMatchObject({
      code: IMPORT_ERROR_CODES.existingSecret,
    } satisfies Partial<CliError>);

    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("Issues:");
    expect(output).toContain("API_KEY: import.existing_secret");
    expect(output).not.toContain("alpha");
    expect(output).not.toContain("beta");
    stdout.mockRestore();
  });

  it("prepends --variable-key-prefix without normalization", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const filePath = await writeEnvFile("API_KEY=alpha\n");

    await expect(
      runImportCommand(flags, api, mockContext, {
        filePath,
        dryRun: false,
        variableKeyPrefix: "local_",
      }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("never echoes offending tokens for malformed import lines", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi();
    const secretLine = "super-secret-token-without-equals\n";
    const filePath = await writeEnvFile(`${secretLine}API_KEY=alpha\n`);

    await expect(
      runImportCommand(flags, api, mockContext, { filePath, dryRun: true }),
    ).rejects.toMatchObject({
      code: IMPORT_ERROR_CODES.parseError,
    } satisfies Partial<CliError>);

    const serialized = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(serialized).not.toContain("super-secret-token-without-equals");
    expect(serialized).not.toContain("alpha");
    stdout.mockRestore();
  });

  it("rejects non-UTF-8 import files before any write", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    fixtureDir = await mkdtemp(join(tmpdir(), "insecur-import-fixture-"));
    envFilePath = join(fixtureDir, ".env");
    await writeFile(envFilePath, Buffer.from([0xff, 0xfe, 0x41, 0x3d, 0x31]));

    await expect(
      runImportCommand(flags, api, mockContext, { filePath: envFilePath, dryRun: false }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidEncoding,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("requires auth before reading the import file", async () => {
    const api = createMockApi();
    const filePath = await writeEnvFile("API_KEY=alpha\n");

    await expect(
      runImportCommand(flags, api, mockContext, { filePath, dryRun: false }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("reports written variable keys when a mid-loop write fails", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const keys = Array.from({ length: 10 }, (_, index) => `KEY_${String(index)}`);
    const filePath = await writeEnvFile(`${keys.map((key) => `${key}=value-${key}\n`).join("")}`);
    let writeAttempt = 0;
    const api = createMockApi({
      writeSecretByVariableKey: vi.fn(async (input: { variableKey: string }) => {
        writeAttempt += 1;
        if (writeAttempt === 5) {
          return {
            ok: false as const,
            envelope: {
              ok: false as const,
              error: {
                code: "operation.internal_error" as const,
                message: "Upstream write failed.",
                retryable: true,
              },
            },
            httpStatus: 500,
          };
        }
        return {
          ok: true as const,
          envelope: {
            ok: true as const,
            data: {
              secretId: SECRET_ID,
              secretVersionId: VERSION_ID,
              variableKey: input.variableKey,
              createdSecretShape: true,
              auditEventId: "aud_01TEST00000000000000000001",
            },
            meta: { requestId: "req_test" as never },
          },
        };
      }),
    });

    await expect(
      runImportCommand(flags, api, mockContext, { filePath, dryRun: false }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("KEY_0, KEY_1, KEY_2, KEY_3"),
      data: {
        writtenVariableKeys: ["KEY_0", "KEY_1", "KEY_2", "KEY_3"],
        completedWriteCount: 4,
        attemptedWriteCount: 10,
      },
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).toHaveBeenCalledTimes(5);
  });
});

describe("runLocalFilesRmCommand", () => {
  let fixtureDir: string;
  let filePath: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    confirmMocks.readConfirmPrompt.mockReset();
    if (filePath !== undefined) {
      await unlink(filePath).catch(() => undefined);
    }
  });

  it("deletes only after explicit confirmation", async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "insecur-local-files-fixture-"));
    filePath = join(fixtureDir, ".env");
    await writeFile(filePath, "API_KEY=secret\n", "utf8");

    confirmMocks.readConfirmPrompt.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const cancelled = await runLocalFilesRmCommand(
      { ...flags, json: false, quiet: true },
      { filePath, yes: false },
    );
    expect(cancelled).toBe(EXIT_VALIDATION);
    await expect(readFile(filePath, "utf8")).resolves.toContain("API_KEY");

    const deleted = await runLocalFilesRmCommand(
      { ...flags, json: false, quiet: true },
      { filePath, yes: false },
    );
    expect(deleted).toBe(0);
    await expect(readFile(filePath, "utf8")).rejects.toThrow();
  });

  it("never reads or prints file contents", async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "insecur-local-files-fixture-"));
    filePath = join(fixtureDir, ".env");
    await writeFile(filePath, "API_KEY=secret\n", "utf8");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const exitCode = await runLocalFilesRmCommand(
      { ...flags, json: false, quiet: true },
      { filePath, yes: true },
    );

    expect(exitCode).toBe(0);
    const output = stdout.mock.calls
      .concat(stderr.mock.calls)
      .map((call) => String(call[0]))
      .join("");
    expect(output).not.toContain("API_KEY");
    expect(output).not.toContain("secret");
    stdout.mockRestore();
    stderr.mockRestore();
  });
});
