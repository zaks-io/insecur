import { afterEach, describe, expect, it, vi } from "vitest";
import { type DeriveAgentSessionData } from "@insecur/domain";
import type { ApiClient } from "../src/api/types.js";
import type { AgentCredentialStore } from "../src/auth/agent-credential-store.js";
import { CLI_CHILD_BASELINE_ENV_KEYS, CLI_SESSION_TOKEN_ENV } from "../src/auth/child-env.js";
import { CLI_AGENT_CREDENTIAL_FILE_ENV } from "../src/auth/agent-env-keys.js";
import { runAgentEnvCommand } from "../src/commands/agent-env.js";
import { buildAgentMarkedChildEnv } from "../src/commands/agent-shared.js";
import { runAgentShellCommand } from "../src/commands/agent-shell.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";

const HOST = "https://insecur.test";
const HUMAN_CREDENTIAL = "human-credential";
const AGENT_CREDENTIAL = "agent-credential";

const flags = {
  host: HOST,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  agent: undefined,
  json: false,
  quiet: true,
  verbose: false,
};

const context: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
  scope: {
    host: HOST,
    orgId: undefined,
    projectId: undefined,
    envId: undefined,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

const deriveData: DeriveAgentSessionData = {
  sessionId: "session_human",
  expiresAt: "2026-08-01T00:00:00.000Z",
  agentSessionId: "ags_00000000000000000000000011" as never,
};

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createCliAuthorizationUrl: () => HOST,
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
    sessionWhoami: async () => {
      throw new Error("not used");
    },
    deriveAgentSession: vi.fn(async () => ({
      ok: true as const,
      credential: AGENT_CREDENTIAL,
      envelope: { ok: true as const, data: deriveData },
    })),
    registerAgentSession: async () => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("agent child env", () => {
  it("stays deny-by-default and adds only agent-marked session material", () => {
    const childEnv = buildAgentMarkedChildEnv({
      credential: AGENT_CREDENTIAL,
      host: HOST,
      agentTag: "my-agent",
      env: {
        INSECUR_SESSION_TOKEN: HUMAN_CREDENTIAL,
        INSECUR_DEPLOY_KEY: "deploy",
        OPENAI_API_KEY: "openai",
        PATH: "/usr/bin",
      },
    });

    expect(childEnv[CLI_SESSION_TOKEN_ENV]).toBe(AGENT_CREDENTIAL);
    expect(childEnv.INSECUR_HOST).toBe(HOST);
    expect(childEnv.INSECUR_AGENT_TAG).toBe("my-agent");
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.OPENAI_API_KEY).toBeUndefined();
    expect(childEnv.PATH).toBe("/usr/bin");
    const allowed = new Set<string>([
      ...CLI_CHILD_BASELINE_ENV_KEYS,
      CLI_SESSION_TOKEN_ENV,
      "INSECUR_HOST",
      "INSECUR_AGENT_TAG",
    ]);
    for (const key of Object.keys(childEnv)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("agent shell", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.CLAUDECODE;
    delete process.env.INSECUR_AGENT_TAG;
    vi.restoreAllMocks();
  });

  it("derives an agent session and spawns the child with the agent credential", async () => {
    setMemorySession({
      credential: HUMAN_CREDENTIAL,
      sessionId: "session_human",
      expiresAt: deriveData.expiresAt,
    });
    const api = createApi();
    const spawn = vi.spyOn(await import("../src/commands/run-child.js"), "spawnCommand");
    spawn.mockResolvedValue(0);

    const exitCode = await runAgentShellCommand(flags, api, context, [
      "node",
      "-e",
      "process.exit(0)",
    ]);
    expect(exitCode).toBe(0);
    expect(api.deriveAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        host: HOST,
        bearerCredential: HUMAN_CREDENTIAL,
      }),
    );
    expect(spawn).toHaveBeenCalledWith(
      ["node", "-e", "process.exit(0)"],
      expect.objectContaining({
        [CLI_SESSION_TOKEN_ENV]: AGENT_CREDENTIAL,
        INSECUR_HOST: HOST,
      }),
    );
  });
});

describe("agent env", () => {
  afterEach(() => {
    clearMemorySession();
    vi.restoreAllMocks();
  });

  it("prints metadata-only exports pointing at a sealed credential file", async () => {
    setMemorySession({
      credential: HUMAN_CREDENTIAL,
      sessionId: "session_human",
      expiresAt: deriveData.expiresAt,
    });
    const store: AgentCredentialStore = {
      save: vi.fn(async () => "/tmp/agent-derived.sealed"),
      load: vi.fn(async () => undefined),
    };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const api = createApi();

    const exitCode = await runAgentEnvCommand(flags, api, context, { agentCredentialStore: store });
    expect(exitCode).toBe(0);
    const output = String(stdout.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("export INSECUR_HOST=");
    expect(output).toContain(`export ${CLI_AGENT_CREDENTIAL_FILE_ENV}=`);
    expect(output).not.toContain(AGENT_CREDENTIAL);
    expect(output).not.toContain("INSECUR_SESSION_TOKEN=");
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: AGENT_CREDENTIAL,
        host: HOST,
        sessionId: deriveData.sessionId,
      }),
    );
  });
});
