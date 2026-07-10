import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64Url } from "@insecur/domain";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { runRunCommand } from "../src/commands/run.js";
import { parseRunCommandArgv, splitRunCommandArgs } from "../src/commands/resolve-run-profile.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { CLI_CHILD_BASELINE_ENV_KEYS } from "../src/auth/child-env.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST0000000000000000001";
const PROFILE_ID = "prof_01TEST00000000000000000001";
const POLICY_ID = "rp_01TEST00000000000000000001";
const GRANT_ID = "igr_01TEST00000000000000000001";
const SECRET_A_ID = "sec_01TEST00000000000000000001";
const SECRET_B_ID = "sec_01TEST00000000000000000002";
const VERSION_A_ID = "sv_01TEST00000000000000000001";
const VERSION_B_ID = "sv_01TEST00000000000000000002";
const SENSITIVE_A = "policy-secret-a";
const SENSITIVE_B = "policy-secret-b";
const NON_EXPIRED_SESSION_EXPIRES_AT = "2999-01-01T00:00:00.000Z";

const flags = {
  host: "https://insecur.test",
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const mockContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: {
    profiles: {
      [PROFILE_ID]: {
        slug: "local-dev",
        displayName: "Local development" as never,
        host: flags.host,
        orgId: ORG_ID as never,
        projectId: PROJECT_ID as never,
        envId: ENV_ID as never,
        defaultRunPolicyId: POLICY_ID as never,
      },
    },
  },
  scope: {
    host: flags.host,
    orgId: undefined,
    projectId: undefined,
    envId: undefined,
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

function createMockApi(): ApiClient & {
  issueInjectionGrant: ReturnType<typeof vi.fn>;
  consumeInjectionGrantAll: ReturnType<typeof vi.fn>;
  recordInjectionRunCompleted: ReturnType<typeof vi.fn>;
} {
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
  const consumeInjectionGrantAll = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      delivery: {
        grantId: GRANT_ID,
        entries: [
          {
            variableKey: "API_KEY",
            secretId: SECRET_A_ID,
            secretVersionId: VERSION_A_ID,
            encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode(SENSITIVE_A)),
          },
          {
            variableKey: "DATABASE_URL",
            secretId: SECRET_B_ID,
            secretVersionId: VERSION_B_ID,
            encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode(SENSITIVE_B)),
          },
        ],
        auditEventId: "aud_consume",
      },
      meta: { requestId: "req_consume" as never },
    },
  }));
  const recordInjectionRunCompleted = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        auditEventId: "aud_run_completed",
        alreadyRecorded: false,
      },
      meta: { requestId: "req_run_completed" as never },
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
    issueInjectionGrant,
    consumeInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrantAll,
    recordInjectionRunCompleted,
  };
}

describe("splitRunCommandArgs", () => {
  it("splits profile selector before -- from child command", () => {
    expect(splitRunCommandArgs(["local-dev", "--", "npm", "test"])).toEqual({
      profileSelector: "local-dev",
      command: ["npm", "test"],
    });
  });

  it("returns command only when no -- separator is present", () => {
    expect(splitRunCommandArgs(["npm", "test"])).toEqual({
      command: ["npm", "test"],
    });
  });
});

describe("parseRunCommandArgv", () => {
  it("prefers commander positional profile over args without a -- separator", () => {
    expect(
      parseRunCommandArgv({
        positionalProfile: "local-dev",
        args: ["npm", "test"],
      }),
    ).toEqual({
      profileSelector: "local-dev",
      command: ["npm", "test"],
    });
  });

  it("drops a duplicated positional profile prefix from child argv", () => {
    expect(
      parseRunCommandArgv({
        positionalProfile: "local-dev",
        args: ["local-dev", "npm", "test"],
      }),
    ).toEqual({
      profileSelector: "local-dev",
      command: ["npm", "test"],
    });
  });

  it("keeps profile and command split when -- is present in excess args", () => {
    expect(
      parseRunCommandArgv({
        positionalProfile: "local-dev",
        args: ["--", "npm", "test"],
      }),
    ).toEqual({
      profileSelector: "local-dev",
      command: ["npm", "test"],
    });
  });

  it("falls back to profile before -- when no positional profile is bound", () => {
    expect(parseRunCommandArgv({ args: ["local-dev", "--", "npm", "test"] })).toEqual({
      profileSelector: "local-dev",
      command: ["npm", "test"],
    });
  });
});

describe("runRunCommand profile-backed policy path", () => {
  let stdout = "";

  afterEach(() => {
    clearMemorySession();
    delete process.env.API_KEY;
    delete process.env.DATABASE_URL;
    vi.restoreAllMocks();
    spawnMock.mockReset();
    stdout = "";
  });

  it("issues a policy grant, consumes all bindings once, injects only policy variables, and omits sensitive values from JSON output", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    spawnMock.mockImplementation((_executable, _args, options: { env: NodeJS.ProcessEnv }) => {
      capturedEnv = options.env;
      expect(options.stdio).toEqual(["inherit", "pipe", "inherit"]);
      return createMockChild(0);
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runRunCommand(flags, api, mockContext, {
      profileSelector: "local-dev",
      command: ["node", "-e", "process.exit(0)"],
    });

    expect(exitCode).toBe(0);
    expect(api.issueInjectionGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        policyId: POLICY_ID,
      }),
    );
    expect(api.consumeInjectionGrantAll).toHaveBeenCalledTimes(1);
    expect(capturedEnv?.API_KEY).toBe(SENSITIVE_A);
    expect(capturedEnv?.DATABASE_URL).toBe(SENSITIVE_B);
    const allowedKeys = new Set<string>([
      ...CLI_CHILD_BASELINE_ENV_KEYS,
      "API_KEY",
      "DATABASE_URL",
    ]);
    expect(Object.keys(capturedEnv ?? {}).every((name) => allowedKeys.has(name))).toBe(true);

    const parsed = JSON.parse(stdout.trim()) as {
      ok: boolean;
      data: {
        grantId: string;
        policyId: string;
        exitSource: string;
        injectedVariableKeys: string[];
        bindings: { variableKey: string }[];
      };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.policyId).toBe(POLICY_ID);
    expect(parsed.data.exitSource).toBe("child");
    expect(parsed.data.injectedVariableKeys).toEqual(["API_KEY", "DATABASE_URL"]);
    expect(stdout).not.toContain(SENSITIVE_A);
    expect(stdout).not.toContain(SENSITIVE_B);
    expect(JSON.stringify(parsed)).not.toContain("encodedValueUtf8");
    stdoutSpy.mockRestore();
  });

  it("accepts global --profile without a positional profile argument", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();
    spawnMock.mockImplementation((_executable, _args, options: { env: NodeJS.ProcessEnv }) => {
      expect(options.stdio).toEqual(["inherit", "pipe", "inherit"]);
      return createMockChild(0);
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runRunCommand({ ...flags, profile: "local-dev" }, api, mockContext, {
      command: ["node", "-e", "process.exit(0)"],
    });

    expect(exitCode).toBe(0);
    expect(api.issueInjectionGrant).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: POLICY_ID }),
    );
    stdoutSpy.mockRestore();
  });

  it("accepts the resolved default profile slug from CLI scope", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();
    spawnMock.mockImplementation(() => createMockChild(0));
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runRunCommand(
      flags,
      api,
      {
        ...mockContext,
        scope: {
          ...mockContext.scope,
          profileSlug: "local-dev",
          profileId: PROFILE_ID as never,
          profile: mockContext.userConfig.profiles[PROFILE_ID],
        },
      },
      {
        command: ["node", "-e", "process.exit(0)"],
      },
    );

    expect(exitCode).toBe(0);
    expect(api.consumeInjectionGrantAll).toHaveBeenCalledTimes(1);
    stdoutSpy.mockRestore();
  });

  it("accepts the resolved default profile id from CLI scope", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();
    spawnMock.mockImplementation(() => createMockChild(0));
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runRunCommand(
      flags,
      api,
      {
        ...mockContext,
        scope: {
          ...mockContext.scope,
          orgId: ORG_ID as never,
          projectId: PROJECT_ID as never,
          envId: ENV_ID as never,
          profileId: PROFILE_ID as never,
        },
      },
      {
        command: ["node", "-e", "process.exit(0)"],
      },
    );

    expect(exitCode).toBe(0);
    expect(api.issueInjectionGrant).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: POLICY_ID }),
    );
    expect(api.consumeInjectionGrantAll).toHaveBeenCalledTimes(1);
    stdoutSpy.mockRestore();
  });

  it("accepts global --profile-id without a positional profile argument", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();
    spawnMock.mockImplementation(() => createMockChild(0));
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runRunCommand(
      { ...flags, profileId: PROFILE_ID as never },
      api,
      mockContext,
      {
        command: ["node", "-e", "process.exit(0)"],
      },
    );

    expect(exitCode).toBe(0);
    expect(api.issueInjectionGrant).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: POLICY_ID }),
    );
    stdoutSpy.mockRestore();
  });
});
