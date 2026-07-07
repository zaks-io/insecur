import { afterEach, describe, expect, it, vi } from "vitest";
import { OPERATION_ERROR_CODES } from "@insecur/domain";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import type { ApiClient, OperationPollData } from "../src/api/types.js";
import { runOperationsGetCommand } from "../src/commands/operations-get.js";
import { runOperationsWaitCommand } from "../src/commands/operations-wait.js";
import { runOperationsCancelCommand } from "../src/commands/operations-cancel.js";
import { EXIT_CONFLICT, EXIT_WAIT_TIMEOUT } from "../src/output/exit-codes.js";
import { setMemorySession, clearMemorySession } from "../src/session/memory-session.js";

const ORG_ID = "org_01TEST00000000000000000001";
const OPERATION_ID = "op_01TEST00000000000000000001";

const flags = {
  host: "https://insecur.test",
  orgId: ORG_ID as never,
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
  userConfig: { profiles: {} },
  scope: {
    host: flags.host,
    orgId: ORG_ID as never,
    projectId: undefined,
    envId: undefined,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

const runningOperation: OperationPollData = {
  operationId: OPERATION_ID as never,
  organizationId: ORG_ID as never,
  state: "running",
  intentCode: "sync.run",
  progress: { counters: { bindingsTotal: 2, bindingsSucceeded: 1 } },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:01:00.000Z",
};

const succeededOperation: OperationPollData = {
  ...runningOperation,
  state: "succeeded",
  updatedAt: "2026-07-01T00:02:00.000Z",
};

function setTestSession(): void {
  setMemorySession({
    credential: "credential_test",
    sessionId: "sess_test",
    expiresAt: "2026-01-01T00:00:00.000Z",
  });
}

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
    getOperation: vi.fn(),
    cancelOperation: vi.fn(),
    ...overrides,
  };
}

describe("operations get", () => {
  afterEach(() => {
    clearMemorySession();
    vi.restoreAllMocks();
  });

  it("returns metadata-only operation state", async () => {
    setTestSession();
    const api = createMockApi({
      getOperation: vi.fn(async () => ({
        ok: true as const,
        envelope: { ok: true as const, data: runningOperation },
      })),
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runOperationsGetCommand(flags, api, mockContext, OPERATION_ID);
    expect(exitCode).toBe(0);
    const line = stdout.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        operationId: OPERATION_ID,
        state: "running",
        intentCode: "sync.run",
        progress: { counters: { bindingsTotal: 2, bindingsSucceeded: 1 } },
      },
    });
    expect(JSON.stringify(parsed)).not.toMatch(/valueUtf8|plaintext|secret|password/i);
  });
});

describe("operations wait", () => {
  afterEach(() => {
    clearMemorySession();
    vi.restoreAllMocks();
  });

  it("polls until terminal state", async () => {
    setTestSession();
    const getOperation = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        envelope: { ok: true as const, data: runningOperation },
      })
      .mockResolvedValueOnce({
        ok: true as const,
        envelope: { ok: true as const, data: succeededOperation },
      });
    const api = createMockApi({ getOperation });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runOperationsWaitCommand(flags, api, mockContext, {
      operationId: OPERATION_ID,
    });
    expect(exitCode).toBe(0);
    expect(getOperation).toHaveBeenCalledTimes(2);
    const line = stdout.mock.calls.at(-1)?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({ ok: true, data: { state: "succeeded" } });
  });

  it("fails with operation.wait_timeout at exit 9 and carries current state", async () => {
    vi.useFakeTimers();
    setTestSession();
    const getOperation = vi.fn(async () => ({
      ok: true as const,
      envelope: { ok: true as const, data: runningOperation },
    }));
    const api = createMockApi({ getOperation });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const waitPromise = runOperationsWaitCommand(flags, api, mockContext, {
      operationId: OPERATION_ID,
      timeoutSeconds: 1,
    });
    await vi.advanceTimersByTimeAsync(1_100);
    const exitCode = await waitPromise;

    expect(exitCode).toBe(EXIT_WAIT_TIMEOUT);
    const line = stderr.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: OPERATION_ERROR_CODES.waitTimeout },
      data: { operationId: OPERATION_ID, state: "running" },
    });
    expect(JSON.stringify(parsed)).toContain("insecur operations wait");
    vi.useRealTimers();
  });
});

describe("operations cancel", () => {
  afterEach(() => {
    clearMemorySession();
    vi.restoreAllMocks();
  });

  it("returns canceled metadata and audit linkage", async () => {
    setTestSession();
    const api = createMockApi({
      cancelOperation: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            ...succeededOperation,
            state: "canceled",
            auditEventId: "aud_01TEST00000000000000000001",
          },
        },
      })),
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runOperationsCancelCommand(flags, api, mockContext, OPERATION_ID);
    expect(exitCode).toBe(0);
    const line = stdout.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        state: "canceled",
        auditEventId: "aud_01TEST00000000000000000001",
      },
    });
  });

  it("maps terminal cancel to operation.not_cancelable at exit 6", async () => {
    setTestSession();
    const api = createMockApi({
      cancelOperation: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 409,
        envelope: {
          ok: false as const,
          error: {
            code: OPERATION_ERROR_CODES.notCancelable,
            message: "not cancelable",
            retryable: false,
          },
        },
      })),
    });

    await expect(
      runOperationsCancelCommand(flags, api, mockContext, OPERATION_ID),
    ).rejects.toMatchObject({ exitCode: EXIT_CONFLICT });
  });
});
