import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import type { SessionWhoamiData } from "@insecur/domain";
import type { ApiClient } from "../src/api/types.js";
import type { AgentSessionStateStore } from "../src/agent-session/persisted-agent-session.js";
import { runWhoamiCommand } from "../src/commands/whoami.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";

const ACTOR_USER_ID = userId.brand("usr_00000000000000000000000011");
const SESSION_ID = "session_whoami_test";

const flags = {
  host: "https://insecur.test",
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  agent: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const mockContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
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

const whoamiData: SessionWhoamiData = {
  actorType: "user",
  userId: ACTOR_USER_ID,
  sessionId: SESSION_ID,
  sessionValid: true,
  sessionExpiresAt: "2026-08-01T00:00:00.000Z",
  resolvedContext: {},
  attribution: { tier: "none" },
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
    createProject: async () => {
      throw new Error("not used");
    },
    listEnvironments: async () => {
      throw new Error("not used");
    },
    createEnvironment: async () => {
      throw new Error("not used");
    },
    listAuditEvents: async () => {
      throw new Error("not used");
    },
    getOperation: async () => {
      throw new Error("not used");
    },
    cancelOperation: async () => {
      throw new Error("not used");
    },
    sessionWhoami: vi.fn(async () => ({
      ok: true as const,
      envelope: { ok: true as const, data: whoamiData },
    })),
    ...overrides,
  };
}

describe("whoami CLI", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    delete process.env.INSECUR_AGENT_TAG;
    delete process.env.CLAUDECODE;
    vi.restoreAllMocks();
  });

  it("returns metadata-only JSON with required fields on an authenticated session", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: SESSION_ID,
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    const api = createMockApi();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runWhoamiCommand(flags, api, mockContext);
    expect(exitCode).toBe(0);
    const line = stdout.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        actorType: "user",
        userId: ACTOR_USER_ID,
        sessionId: SESSION_ID,
        sessionValid: true,
        sessionExpiresAt: "2026-08-01T00:00:00.000Z",
        resolvedContext: {},
        attribution: { tier: "none" },
      },
    });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toMatch(/credential|token|password|plaintext|secret/i);
  });

  it("reports local-mode identity without demanding authentication", async () => {
    const api = createMockApi();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const localContext: ResolvedCliContext = {
      ...mockContext,
      scope: { ...mockContext.scope, host: "local" },
    };

    const exitCode = await runWhoamiCommand(flags, api, localContext);
    expect(exitCode).toBe(0);
    const line = stdout.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: true,
      data: { mode: "local", host: "local" },
    });
  });

  it("exits 3 with plain login remediation when unauthenticated at a human terminal", async () => {
    vi.stubEnv("CLAUDECODE", "");
    vi.stubEnv("CURSOR_AGENT", "");
    vi.stubEnv("CURSOR_TRACE_ID", "");
    const api = createMockApi();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const exitCode = await runWhoamiCommand(flags, api, mockContext);
    expect(exitCode).toBe(EXIT_AUTH_REQUIRED);
    const line = stderr.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: AUTH_ERROR_CODES.required },
      remediation: { login: ["insecur", "login"] },
    });
    vi.unstubAllEnvs();
  });

  it("tells a detected agent harness to hand login to its human", async () => {
    vi.stubEnv("CLAUDECODE", "1");
    const api = createMockApi();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const exitCode = await runWhoamiCommand(flags, api, mockContext);
    expect(exitCode).toBe(EXIT_AUTH_REQUIRED);
    const line = stderr.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: AUTH_ERROR_CODES.required },
      remediation: { login: ["insecur", "login", "--shell"] },
    });
    vi.unstubAllEnvs();
  });

  it("forwards harness and agent tag query params", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: SESSION_ID,
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    process.env.CLAUDECODE = "1";
    const sessionWhoami = vi.fn(async () => ({
      ok: true as const,
      envelope: { ok: true as const, data: whoamiData },
    }));
    const api = createMockApi({ sessionWhoami });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runWhoamiCommand({ ...flags, agent: "my-agent" }, api, mockContext);

    expect(sessionWhoami).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTag: "my-agent",
        harnessName: "agent.harness.claude_code",
        ancestryKey: expect.any(String),
      }),
    );
  });

  it("persists registered agent session ids for follow-up reads", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: SESSION_ID,
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    const store: AgentSessionStateStore = {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };
    const registeredData: SessionWhoamiData = {
      ...whoamiData,
      attribution: {
        tier: "registered",
        agentSessionId: "ags_00000000000000000000000011" as never,
        harnessName: "agent.harness.claude_code",
      },
    };
    const api = createMockApi({
      sessionWhoami: vi.fn(async () => ({
        ok: true as const,
        envelope: { ok: true as const, data: registeredData },
      })),
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runWhoamiCommand(flags, api, mockContext, { agentSessionStateStore: store });

    expect(store.save).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agentSessionId: "ags_00000000000000000000000011",
        harnessName: "agent.harness.claude_code",
      }),
    );
  });
});
