import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64Url, INJECTION_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";

function pendingForever(): Promise<void> {
  return new Promise(() => undefined);
}

let restartWaits = 0;

const spawnCommandManagedMock = vi.hoisted(() => vi.fn());

vi.mock("../src/commands/run-child.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/run-child.js")>();
  return {
    ...actual,
    spawnCommandManaged: spawnCommandManagedMock,
  };
});

vi.mock("../src/commands/run-watch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/run-watch.js")>();
  return {
    ...actual,
    runWatchLoop: (input: Parameters<typeof actual.runWatchLoop>[0]) =>
      actual.runWatchLoop({
        ...input,
        waitForRestartSignal: async () => {
          restartWaits += 1;
          if (restartWaits === 1) {
            return;
          }
          await pendingForever();
        },
      }),
  };
});

import { runRunCommand } from "../src/commands/run.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import type { InsecurProjectConfig } from "../src/config/project-config.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { EXIT_FORBIDDEN, EXIT_VALIDATION } from "../src/output/exit-codes.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const DEV_ENV_ID = "env_01TEST0000000000000000001";
const PREVIEW_ENV_ID = "env_01TEST0000000000000000002";
const SECRET_ID = "sec_01TEST00000000000000000001";
const VERSION_ID = "sv_01TEST00000000000000000001";
const POLICY_ID = "rp_01TEST00000000000000000001";
const PROFILE_ID = "prof_01TEST00000000000000000001";
const SENSITIVE_VALUE = "super-secret-runtime-value";
const NON_EXPIRED_SESSION_EXPIRES_AT = "2999-01-01T00:00:00.000Z";

const projectConfig: InsecurProjectConfig = {
  host: "https://insecur.test",
  orgId: ORG_ID as never,
  projectId: PROJECT_ID as never,
  defaultEnvId: DEV_ENV_ID as never,
  profileId: "prof_01TEST00000000000000000001" as never,
};

const flags = {
  host: "https://insecur.test",
  orgId: ORG_ID as never,
  projectId: PROJECT_ID as never,
  envId: DEV_ENV_ID as never,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const mockContext: ResolvedCliContext = {
  projectConfig,
  userConfig: { profiles: {} },
  scope: {
    host: flags.host,
    orgId: ORG_ID as never,
    projectId: PROJECT_ID as never,
    envId: DEV_ENV_ID as never,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

const profileMockContext: ResolvedCliContext = {
  projectConfig,
  userConfig: {
    profiles: {
      [PROFILE_ID]: {
        slug: "local-dev",
        displayName: "Local development" as never,
        host: flags.host,
        orgId: ORG_ID as never,
        projectId: PROJECT_ID as never,
        envId: DEV_ENV_ID as never,
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

function exitCodeForChild(
  child: EventEmitter & ChildProcess & { kill: ReturnType<typeof vi.fn> },
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      if (signal === null) {
        resolve(0);
        return;
      }
      resolve(143);
    });
  });
}

function spawnManagedChild(waitForKill = false) {
  const child = new EventEmitter() as EventEmitter &
    ChildProcess & {
      kill: ReturnType<typeof vi.fn>;
    };
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    child.emit("close", null, signal ?? "SIGTERM");
  });
  const exitCodePromise = exitCodeForChild(child);
  if (!waitForKill) {
    queueMicrotask(() => {
      child.emit("close", 0, null);
    });
  }
  return { child, exitCode: exitCodePromise };
}

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient & {
  issueInjectionGrant: ReturnType<typeof vi.fn>;
  consumeInjectionGrant: ReturnType<typeof vi.fn>;
  recordInjectionRunCompleted: ReturnType<typeof vi.fn>;
} {
  let grantCounter = 0;
  const encodedValueUtf8 = bytesToBase64Url(new TextEncoder().encode(SENSITIVE_VALUE));
  const issueInjectionGrant = vi.fn(async () => {
    grantCounter += 1;
    return {
      ok: true as const,
      envelope: {
        ok: true as const,
        data: {
          grantId: `igr_01TEST00000000000000000${String(grantCounter).padStart(3, "0")}`,
          expiresAt: "2026-01-01T00:05:00.000Z",
        },
        meta: { requestId: `req_issue_${String(grantCounter)}` as never },
      },
    };
  });
  const consumeInjectionGrant = vi.fn(async (input: { grantId: string }) => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      delivery: {
        grantId: input.grantId,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
        secretVersionId: VERSION_ID,
        encodedValueUtf8,
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
    consumeInjectionGrant,
    consumeInjectionGrantAll: async () => {
      throw new Error("not used");
    },
    recordInjectionRunCompleted,
    ...overrides,
  };
}

function createMockPolicyApi(overrides: Partial<ApiClient> = {}): ApiClient & {
  issueInjectionGrant: ReturnType<typeof vi.fn>;
  consumeInjectionGrantAll: ReturnType<typeof vi.fn>;
  recordInjectionRunCompleted: ReturnType<typeof vi.fn>;
} {
  let grantCounter = 0;
  const issueInjectionGrant = vi.fn(async () => {
    grantCounter += 1;
    return {
      ok: true as const,
      envelope: {
        ok: true as const,
        data: {
          grantId: `igr_01TEST00000000000000000${String(grantCounter).padStart(3, "0")}`,
          expiresAt: "2026-01-01T00:05:00.000Z",
        },
        meta: { requestId: `req_issue_${String(grantCounter)}` as never },
      },
    };
  });
  const consumeInjectionGrantAll = vi.fn(async (input: { grantId: string }) => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      delivery: {
        grantId: input.grantId,
        entries: [
          {
            variableKey: "API_KEY",
            secretId: SECRET_ID,
            secretVersionId: VERSION_ID,
            encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode(SENSITIVE_VALUE)),
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
    ...overrides,
  };
}

describe("runRunCommand --watch", () => {
  let stdout = "";

  afterEach(() => {
    clearMemorySession();
    delete process.env.API_KEY;
    restartWaits = 0;
    spawnCommandManagedMock.mockReset();
    stdout = "";
  });

  it("issues and consumes a distinct grant on each watch restart", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();
    const consumedGrantIds: string[] = [];
    api.consumeInjectionGrant.mockImplementation(async (input: { grantId: string }) => {
      consumedGrantIds.push(input.grantId);
      const encodedValueUtf8 = bytesToBase64Url(new TextEncoder().encode(SENSITIVE_VALUE));
      return {
        ok: true as const,
        envelope: {
          ok: true as const,
          delivery: {
            grantId: input.grantId,
            variableKey: "API_KEY",
            secretId: SECRET_ID,
            secretVersionId: VERSION_ID,
            encodedValueUtf8,
          },
          meta: { requestId: "req_consume" as never },
        },
      };
    });

    let spawnCount = 0;
    spawnCommandManagedMock.mockImplementation(() => {
      spawnCount += 1;
      return spawnManagedChild(spawnCount === 1);
    });

    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runRunCommand(flags, api, mockContext, {
      variableKey: "API_KEY",
      watch: true,
      command: ["node", "-e", "0"],
    });

    expect(exitCode).toBe(0);
    expect(api.issueInjectionGrant).toHaveBeenCalledTimes(2);
    expect(api.consumeInjectionGrant).toHaveBeenCalledTimes(2);
    expect(consumedGrantIds[0]).not.toBe(consumedGrantIds[1]);
    expect(stdout).not.toContain(SENSITIVE_VALUE);
  });

  it("rejects --watch against a non-development environment before issuing grants", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockApi();

    await expect(
      runRunCommand(
        flags,
        api,
        {
          ...mockContext,
          scope: {
            ...mockContext.scope,
            envId: PREVIEW_ENV_ID as never,
          },
        },
        {
          variableKey: "API_KEY",
          watch: true,
          command: ["node", "-e", "0"],
        },
      ),
    ).rejects.toMatchObject({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      exitCode: EXIT_VALIDATION,
    });

    expect(api.issueInjectionGrant).not.toHaveBeenCalled();
    expect(spawnCommandManagedMock).not.toHaveBeenCalled();
  });

  it("halts the watch loop on grant issuance failure without spawning a child with stale values", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    let issueCount = 0;
    const api = createMockApi({
      issueInjectionGrant: vi.fn(async () => {
        issueCount += 1;
        if (issueCount === 2) {
          return {
            ok: false as const,
            envelope: {
              ok: false as const,
              error: {
                code: INJECTION_ERROR_CODES.grantDenied,
                message: "Injection grant denied.",
                retryable: false,
              },
            },
            httpStatus: 403,
          };
        }
        return {
          ok: true as const,
          envelope: {
            ok: true as const,
            data: {
              grantId: "igr_01TEST00000000000000000001",
              expiresAt: "2026-01-01T00:05:00.000Z",
            },
            meta: { requestId: "req_issue" as never },
          },
        };
      }),
    });

    spawnCommandManagedMock.mockImplementation(() => spawnManagedChild(true));

    await expect(
      runRunCommand(flags, api, mockContext, {
        variableKey: "API_KEY",
        watch: true,
        command: ["node", "-e", "0"],
      }),
    ).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
      exitCode: EXIT_FORBIDDEN,
    });

    expect(spawnCommandManagedMock).toHaveBeenCalledTimes(1);
  });
});

describe("runRunCommand --watch profile-backed policy path", () => {
  let stdout = "";

  afterEach(() => {
    clearMemorySession();
    delete process.env.API_KEY;
    restartWaits = 0;
    spawnCommandManagedMock.mockReset();
    stdout = "";
  });

  it("issues and consumes a distinct policy grant on each watch restart", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    const api = createMockPolicyApi();
    const consumedGrantIds: string[] = [];
    api.consumeInjectionGrantAll.mockImplementation(async (input: { grantId: string }) => {
      consumedGrantIds.push(input.grantId);
      return {
        ok: true as const,
        envelope: {
          ok: true as const,
          delivery: {
            grantId: input.grantId,
            entries: [
              {
                variableKey: "API_KEY",
                secretId: SECRET_ID,
                secretVersionId: VERSION_ID,
                encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode(SENSITIVE_VALUE)),
              },
            ],
            auditEventId: "aud_consume",
          },
          meta: { requestId: "req_consume" as never },
        },
      };
    });

    let spawnCount = 0;
    spawnCommandManagedMock.mockImplementation(() => {
      spawnCount += 1;
      return spawnManagedChild(spawnCount === 1);
    });

    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runRunCommand(flags, api, profileMockContext, {
      profileSelector: "local-dev",
      watch: true,
      command: ["node", "-e", "0"],
    });

    expect(exitCode).toBe(0);
    expect(api.issueInjectionGrant).toHaveBeenCalledTimes(2);
    expect(api.issueInjectionGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: DEV_ENV_ID,
        policyId: POLICY_ID,
      }),
    );
    expect(api.consumeInjectionGrantAll).toHaveBeenCalledTimes(2);
    expect(consumedGrantIds[0]).not.toBe(consumedGrantIds[1]);
    expect(stdout).not.toContain(SENSITIVE_VALUE);
  });

  it("halts the profile-policy watch loop on grant issuance failure without spawning a child with stale values", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });
    let issueCount = 0;
    const api = createMockPolicyApi({
      issueInjectionGrant: vi.fn(async () => {
        issueCount += 1;
        if (issueCount === 2) {
          return {
            ok: false as const,
            envelope: {
              ok: false as const,
              error: {
                code: INJECTION_ERROR_CODES.grantDenied,
                message: "Injection grant denied.",
                retryable: false,
              },
            },
            httpStatus: 403,
          };
        }
        return {
          ok: true as const,
          envelope: {
            ok: true as const,
            data: {
              grantId: "igr_01TEST00000000000000000001",
              expiresAt: "2026-01-01T00:05:00.000Z",
            },
            meta: { requestId: "req_issue" as never },
          },
        };
      }),
    });

    spawnCommandManagedMock.mockImplementation(() => spawnManagedChild(true));

    await expect(
      runRunCommand(flags, api, profileMockContext, {
        profileSelector: "local-dev",
        watch: true,
        command: ["node", "-e", "0"],
      }),
    ).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
      exitCode: EXIT_FORBIDDEN,
    });

    expect(spawnCommandManagedMock).toHaveBeenCalledTimes(1);
  });
});
