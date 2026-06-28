import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64Url, INJECTION_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { runRunCommand } from "../src/commands/run.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { EXIT_CONFLICT, EXIT_VALIDATION } from "../src/output/exit-codes.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST0000000000000000001";
const GRANT_ID = "igr_01TEST00000000000000000001";
const SECRET_ID = "sec_01TEST00000000000000000001";
const VERSION_ID = "sv_01TEST00000000000000000001";
const SENSITIVE_VALUE = "super-secret-runtime-value";

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

function createMockChild(exitCode: number) {
  const child = new EventEmitter() as EventEmitter & { stdout?: unknown; stderr?: unknown };
  queueMicrotask(() => {
    child.emit("close", exitCode, null);
  });
  return child;
}

function createMockChildTerminatedBySignal(signal: NodeJS.Signals) {
  const child = new EventEmitter() as EventEmitter & { stdout?: unknown; stderr?: unknown };
  queueMicrotask(() => {
    child.emit("close", null, signal);
  });
  return child;
}

function createMockChildSpawnError(error: Error) {
  const child = new EventEmitter() as EventEmitter & { stdout?: unknown; stderr?: unknown };
  queueMicrotask(() => {
    child.emit("error", error);
  });
  return child;
}

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient & {
  issueInjectionGrant: ReturnType<typeof vi.fn>;
  consumeInjectionGrant: ReturnType<typeof vi.fn>;
} {
  const encodedValueUtf8 = bytesToBase64Url(new TextEncoder().encode(SENSITIVE_VALUE));
  const issueInjectionGrant = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        grantId: GRANT_ID,
        expiresAt: "2026-01-01T00:05:00.000Z",
        auditEventId: "aud_issue",
      },
      meta: { requestId: "req_issue" as never },
    },
  }));
  const consumeInjectionGrant = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      delivery: {
        grantId: GRANT_ID,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
        secretVersionId: VERSION_ID,
        encodedValueUtf8,
        auditEventId: "aud_consume",
      },
      meta: { requestId: "req_consume" as never },
    },
  }));
  return {
    exchangeCliSession: async () => {
      throw new Error("not used");
    },
    provisionPersonalOrganization: async () => {
      throw new Error("not used");
    },
    writeSecretByVariableKey: async () => {
      throw new Error("not used");
    },
    issueInjectionGrant,
    consumeInjectionGrant,
    ...overrides,
  };
}

describe("runRunCommand", () => {
  let stdout = "";

  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    delete process.env.INSECUR_WORKOS_COOKIE;
    delete process.env.INSECUR_WORKOS_CSRF;
    delete process.env.INSECUR_FUTURE_TOKEN;
    delete process.env.INSECUR_FUTURE_KEY;
    delete process.env.API_KEY;
    vi.restoreAllMocks();
    spawnMock.mockReset();
    stdout = "";
  });

  it("issues and consumes exactly one grant, injects only the requested variable key, and propagates child exit code", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    delete process.env.INSECUR_SESSION_TOKEN;
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    spawnMock.mockImplementation((_executable, _args, options: { env: NodeJS.ProcessEnv }) => {
      capturedEnv = options.env;
      expect(options.stdio).toBe("inherit");
      return createMockChild(42);
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runRunCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      command: ["node", "-e", "process.exit(42)"],
    });

    expect(exitCode).toBe(42);
    expect(api.issueInjectionGrant).toHaveBeenCalledTimes(1);
    expect(api.consumeInjectionGrant).toHaveBeenCalledTimes(1);
    expect(api.consumeInjectionGrant).toHaveBeenCalledWith(
      expect.objectContaining({ grantId: GRANT_ID, variableKey: "API_KEY" }),
    );
    expect(capturedEnv?.API_KEY).toBe(SENSITIVE_VALUE);
    expect(capturedEnv?.INSECUR_SESSION_TOKEN).toBeUndefined();
    const parsed = JSON.parse(stdout.trim()) as {
      ok: boolean;
      data: { childExitCode: number; variableKey: string; grantId: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.childExitCode).toBe(42);
    expect(parsed.data.variableKey).toBe("API_KEY");
    expect(parsed.data.grantId).toBe(GRANT_ID);
    expect(stdout).not.toContain(SENSITIVE_VALUE);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it("excludes INSECUR_SESSION_TOKEN from the child environment even when the parent process has one", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    process.env.INSECUR_SESSION_TOKEN = "inherited-parent-token";
    const api = createMockApi();
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    spawnMock.mockImplementation((_executable, _args, options: { env: NodeJS.ProcessEnv }) => {
      capturedEnv = options.env;
      return createMockChild(0);
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runRunCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      command: ["node", "-e", "0"],
    });

    expect(capturedEnv?.INSECUR_SESSION_TOKEN).toBeUndefined();
    expect(capturedEnv?.API_KEY).toBe(SENSITIVE_VALUE);
  });

  it("scrubs WorkOS exchange material and future auth-bearing INSECUR variables from the child environment", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    process.env.INSECUR_WORKOS_COOKIE = "dummy-workos-cookie";
    process.env.INSECUR_WORKOS_CSRF = "dummy-workos-csrf";
    process.env.INSECUR_FUTURE_TOKEN = "dummy-future-token";
    process.env.INSECUR_FUTURE_KEY = "dummy-future-key";
    const api = createMockApi();
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    spawnMock.mockImplementation((_executable, _args, options: { env: NodeJS.ProcessEnv }) => {
      capturedEnv = options.env;
      return createMockChild(0);
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runRunCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      command: ["node", "-e", "0"],
    });

    expect(capturedEnv?.INSECUR_WORKOS_COOKIE).toBeUndefined();
    expect(capturedEnv?.INSECUR_WORKOS_CSRF).toBeUndefined();
    expect(capturedEnv?.INSECUR_FUTURE_TOKEN).toBeUndefined();
    expect(capturedEnv?.INSECUR_FUTURE_KEY).toBeUndefined();
    expect(capturedEnv?.API_KEY).toBe(SENSITIVE_VALUE);
  });

  it("does not capture child stdout in CLI output", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    spawnMock.mockImplementation(() => createMockChild(0));
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    await runRunCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      command: ["node", "-e", "console.log('child output')"],
    });

    expect(stdout).not.toContain(SENSITIVE_VALUE);
    expect(stdout).not.toContain("child output");
  });

  it("returns 128 + signal number when the child is terminated by a signal", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    spawnMock.mockImplementation(() => createMockChildTerminatedBySignal("SIGTERM"));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runRunCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      command: ["node", "-e", "process.kill(process.pid, 'SIGTERM')"],
    });

    expect(exitCode).toBe(143);
  });

  it("rejects when the child process fails to spawn", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const spawnError = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    spawnMock.mockImplementation(() => createMockChildSpawnError(spawnError));

    await expect(
      runRunCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        command: ["missing-executable"],
      }),
    ).rejects.toThrow("spawn ENOENT");
  });

  it("maps grant replay failures through exitCodeForErrorCode", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi({
      consumeInjectionGrant: vi.fn(async () => ({
        ok: false as const,
        envelope: {
          ok: false as const,
          error: {
            code: INJECTION_ERROR_CODES.grantExpired,
            message: "Injection grant has already been consumed or expired.",
            retryable: false,
          },
        },
        httpStatus: 409,
      })),
    });

    await expect(
      runRunCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        command: ["node", "-e", "0"],
      }),
    ).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantExpired,
      exitCode: EXIT_CONFLICT,
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects invalid variable keys before issuing a grant", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runRunCommand(flags, api, mockContext, {
        variableKey: "bad-key",
        command: ["node", "-e", "0"],
      }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidVariableKey,
      exitCode: EXIT_VALIDATION,
    });
    expect(api.issueInjectionGrant).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("requires a command after --", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createMockApi();

    await expect(
      runRunCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        command: [],
      }),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      exitCode: EXIT_VALIDATION,
    });
    expect(api.issueInjectionGrant).not.toHaveBeenCalled();
    expect(api.consumeInjectionGrant).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
