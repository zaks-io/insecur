import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_ERROR_CODES,
  CLI_ERROR_CODES,
  SECRET_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";

const inputMocks = vi.hoisted(() => ({
  readMaskedPrompt: vi.fn(),
  readStdinBytes: vi.fn(),
}));

vi.mock("../src/input/read-stdin.js", () => ({
  readStdinBytes: inputMocks.readStdinBytes,
}));

vi.mock("../src/input/masked-prompt.js", () => ({
  readMaskedPrompt: inputMocks.readMaskedPrompt,
}));

import { runSecretsSetCommand } from "../src/commands/secrets-set.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { validateSecretValueUtf8 } from "../src/input/validate-secret-value.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

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
): ApiClient & { writeSecretByVariableKey: ReturnType<typeof vi.fn> } {
  const writeSecretByVariableKey = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        secretId: SECRET_ID,
        secretVersionId: VERSION_ID,
        variableKey: "API_KEY",
        createdSecretShape: true,
        auditEventId: "aud_01TEST00000000000000000001",
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
    writeSecretByVariableKey,
    issueInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrantAll: async () => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("runSecretsSetCommand", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
    inputMocks.readMaskedPrompt.mockReset();
    inputMocks.readStdinBytes.mockReset();
  });

  it("requests service generation without generating a value in the CLI", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createMockApi();

    const exitCode = await runSecretsSetCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      generateMode: "random",
      generateLength: "16",
      valueStdin: false,
      allowEmpty: false,
    });

    expect(exitCode).toBe(0);
    expect(api.writeSecretByVariableKey).toHaveBeenCalledTimes(1);
    const call = api.writeSecretByVariableKey.mock.calls[0]?.[0];
    expect(call?.variableKey).toBe("API_KEY");
    expect(call?.organizationId).toBe(ORG_ID);
    expect(call?.projectId).toBe(PROJECT_ID);
    expect(call?.environmentId).toBe(ENV_ID);
    expect(call).toMatchObject({
      generate: { mode: "random", lengthBytes: 16 },
    });
    expect(call).not.toHaveProperty("valueUtf8");

    const line = stdout.mock.calls[0]?.[0] as string;
    const parsed: unknown = JSON.parse(line);
    expect(JSON.stringify(parsed)).not.toContain("valueUtf8");
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        secretId: SECRET_ID,
        secretVersionId: VERSION_ID,
        variableKey: "API_KEY",
        createdSecretShape: true,
      },
      meta: {
        requestId: "req_test",
        resolvedTargets: expect.arrayContaining([
          expect.objectContaining({ type: "secret", id: SECRET_ID, slug: "API_KEY" }),
        ]),
      },
    });
    stdout.mockRestore();
  });

  it("preserves --value-stdin bytes exactly through the command", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exactValue = "line one\nline two\n";
    inputMocks.readStdinBytes.mockResolvedValue(new TextEncoder().encode(exactValue));
    const api = createMockApi();

    const exitCode = await runSecretsSetCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      generateMode: undefined,
      generateLength: undefined,
      valueStdin: true,
      allowEmpty: false,
    });

    expect(exitCode).toBe(0);
    const call = api.writeSecretByVariableKey.mock.calls[0]?.[0];
    expect(new TextDecoder().decode(call?.valueUtf8 ?? new Uint8Array())).toBe(exactValue);
    expect(JSON.stringify(JSON.parse(stdout.mock.calls[0]?.[0] as string))).not.toContain(
      exactValue,
    );
  });

  it("allows explicit empty stdin writes only with --allow-empty", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    inputMocks.readStdinBytes.mockResolvedValue(new Uint8Array());
    const api = createMockApi();

    const exitCode = await runSecretsSetCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      generateMode: undefined,
      generateLength: undefined,
      valueStdin: true,
      allowEmpty: true,
    });

    expect(exitCode).toBe(0);
    const call = api.writeSecretByVariableKey.mock.calls[0]?.[0];
    expect(call?.valueUtf8?.byteLength).toBe(0);
    expect(call?.allowEmpty).toBe(true);
  });

  it("uses the masked prompt for interactive callers without an explicit input mode", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const originalIsTty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    inputMocks.readMaskedPrompt.mockResolvedValue(new TextEncoder().encode("prompt-value"));
    const api = createMockApi();

    const exitCode = await runSecretsSetCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      generateMode: undefined,
      generateLength: undefined,
      valueStdin: false,
      allowEmpty: false,
    });

    expect(exitCode).toBe(0);
    expect(inputMocks.readMaskedPrompt).toHaveBeenCalledWith("Secret value: ");
    const call = api.writeSecretByVariableKey.mock.calls[0]?.[0];
    expect(new TextDecoder().decode(call?.valueUtf8 ?? new Uint8Array())).toBe("prompt-value");
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalIsTty,
    });
  });

  it("requires auth before collecting secret input", async () => {
    const api = createMockApi();

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        generateMode: "random",
        generateLength: "32",
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
    expect(inputMocks.readStdinBytes).not.toHaveBeenCalled();
    expect(inputMocks.readMaskedPrompt).not.toHaveBeenCalled();
  });

  it("rejects mutually exclusive secret input modes with a secret input error", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        generateMode: "random",
        generateLength: "32",
        valueStdin: true,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("rejects invalid variable keys before calling the API", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "invalid-key",
        generateMode: "random",
        generateLength: "32",
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("fails when organization, project, or environment scope is missing", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const incompleteContext: ResolvedCliContext = {
      ...mockContext,
      scope: { ...mockContext.scope, envId: undefined },
    };

    await expect(
      runSecretsSetCommand(flags, api, incompleteContext, {
        variableKey: "API_KEY",
        generateMode: "random",
        generateLength: "32",
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: CLI_ERROR_CODES.parentScopeUnresolved,
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
  });

  it("requires explicit input for non-interactive callers without --generate or --value-stdin", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const originalIsTty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        generateMode: undefined,
        generateLength: undefined,
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.inputRequired,
      exitCode: EXIT_VALIDATION,
      remediation: {
        type: "https://insecur.dev/errors/secret-input-required",
        usage: ["insecur", "secrets", "set", "API_KEY", "--value-stdin"],
      },
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();

    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalIsTty,
    });
  });

  it("maps API error envelopes to CliError", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi({
      writeSecretByVariableKey: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 400,
        envelope: {
          ok: false as const,
          error: {
            code: SECRET_ERROR_CODES.valueTooLarge,
            message: "Secret value is too large.",
            retryable: false,
          },
        },
      })),
    });

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        generateMode: "random",
        generateLength: "32",
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.valueTooLarge,
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
  });
});

describe("secret value validation", () => {
  it("rejects invalid UTF-8", () => {
    expect(() => validateSecretValueUtf8(new Uint8Array([0xff]))).toThrow(
      expect.objectContaining({ code: SECRET_ERROR_CODES.invalidEncoding }),
    );
  });

  it("rejects NUL before a secret can be stored", () => {
    const value = new TextEncoder().encode("before\0after");
    expect(() => validateSecretValueUtf8(value)).toThrowError(
      expect.objectContaining({ code: SECRET_ERROR_CODES.invalidEncoding }),
    );
  });

  it("rejects empty values unless allowEmpty is set", () => {
    expect(() => validateSecretValueUtf8(new Uint8Array(0))).toThrow(
      expect.objectContaining({ code: SECRET_ERROR_CODES.emptyValue }),
    );
    expect(() => validateSecretValueUtf8(new Uint8Array(0), { allowEmpty: true })).not.toThrow();
  });

  it("rejects malformed --length values before calling the API", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        generateMode: "random",
        generateLength: "16abc",
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.invalidInputMode,
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });

  it("rejects oversized generated random lengths before calling the API", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runSecretsSetCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        generateMode: "random",
        generateLength: "49153",
        valueStdin: false,
        allowEmpty: false,
      }),
    ).rejects.toMatchObject({
      code: SECRET_ERROR_CODES.valueTooLarge,
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
    expect(api.writeSecretByVariableKey).not.toHaveBeenCalled();
  });
});
