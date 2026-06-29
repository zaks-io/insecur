import { EventEmitter } from "node:events";
import { errorEnvelope, successEnvelope } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import { runBrowserPkceLogin } from "../src/commands/login-pkce.js";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const flags: GlobalCliFlags = {
  host: "https://insecur.test",
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: false,
  quiet: true,
  verbose: false,
};

function ignoreCallbackFetchError(error: unknown): void {
  void error;
}

function completeLoginCallback(callback: URL): void {
  queueMicrotask(() => {
    void fetch(callback).catch(ignoreCallbackFetchError);
  });
}

interface MockApiOptions {
  readonly completeCallback?: (
    callback: URL,
    input: Parameters<ApiClient["createCliAuthorizationUrl"]>[0],
  ) => void;
  readonly exchangeCliPkceSession?: ApiClient["exchangeCliPkceSession"];
}

function createMockBrowserProcess(options: {
  readonly pid?: number;
  readonly exitCode?: number | null;
}) {
  const child = new EventEmitter() as EventEmitter & {
    pid?: number;
    unref: ReturnType<typeof vi.fn>;
  };
  child.pid = options.pid;
  child.unref = vi.fn();
  if (options.exitCode !== undefined) {
    queueMicrotask(() => {
      child.emit("exit", options.exitCode, null);
    });
  }
  return child;
}

function createMockApi(options: MockApiOptions = {}): ApiClient {
  return {
    createCliAuthorizationUrl(input) {
      expect(input.codeChallengeMethod).toBe("S256");
      expect(input.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(input.codeChallenge.length).toBeGreaterThan(20);
      const callback = new URL(input.redirectUri);
      if (options.completeCallback === undefined) {
        callback.searchParams.set("code", "code_pkce_test");
        callback.searchParams.set("state", input.state);
        completeLoginCallback(callback);
      } else {
        options.completeCallback(callback, input);
      }
      return "https://insecur.test/v1/auth/cli/authorize";
    },
    async exchangeCliPkceSession(input) {
      if (options.exchangeCliPkceSession !== undefined) {
        return options.exchangeCliPkceSession(input);
      }
      expect(input.host).toBe("https://insecur.test");
      expect(input.code).toBe("code_pkce_test");
      expect(input.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(input.codeVerifier.length).toBeGreaterThan(40);
      return {
        ok: true,
        credential: "credential_pkce_test",
        envelope: successEnvelope({
          sessionId: "sess_pkce_test",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      };
    },
    async provisionPersonalOrganization() {
      throw new Error("not used");
    },
    async writeSecretByVariableKey() {
      throw new Error("not used");
    },
    async issueInjectionGrant() {
      throw new Error("not used");
    },
    async consumeInjectionGrant() {
      throw new Error("not used");
    },
  };
}

describe("runBrowserPkceLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
  });

  it("prints the login URL when the OS browser opener is unavailable", async () => {
    spawnMock.mockReturnValue({
      pid: undefined,
      once: vi.fn(),
      unref: vi.fn(),
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runBrowserPkceLogin({
      flags,
      api: createMockApi(),
      host: "https://insecur.test",
      options: { openBrowser: true },
    });

    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain(
      "https://insecur.test/v1/auth/cli/authorize",
    );
  });

  it("prints the login URL when the OS browser opener exits non-zero", async () => {
    spawnMock.mockImplementation(() => createMockBrowserProcess({ pid: 42, exitCode: 1 }));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runBrowserPkceLogin({
      flags,
      api: createMockApi(),
      host: "https://insecur.test",
      options: { openBrowser: true },
    });

    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain(
      "https://insecur.test/v1/auth/cli/authorize",
    );
  });

  it("rejects callbacks with mismatched state", async () => {
    await expect(
      runBrowserPkceLogin({
        flags,
        api: createMockApi({
          completeCallback(callback) {
            callback.searchParams.set("code", "code_pkce_test");
            callback.searchParams.set("state", "state_wrong");
            completeLoginCallback(callback);
          },
        }),
        host: "https://insecur.test",
        options: { openBrowser: false },
      }),
    ).rejects.toMatchObject({
      code: "auth.invalid",
      exitCode: EXIT_AUTH_REQUIRED,
    } satisfies Partial<CliError>);
  });

  it("rejects callbacks without an authorization code", async () => {
    await expect(
      runBrowserPkceLogin({
        flags,
        api: createMockApi({
          completeCallback(callback, input) {
            callback.searchParams.set("state", input.state);
            completeLoginCallback(callback);
          },
        }),
        host: "https://insecur.test",
        options: { openBrowser: false },
      }),
    ).rejects.toMatchObject({
      code: "auth.required",
      exitCode: EXIT_AUTH_REQUIRED,
    } satisfies Partial<CliError>);
  });

  it("returns token exchange failures without printing credentials", async () => {
    const result = await runBrowserPkceLogin({
      flags,
      api: createMockApi({
        exchangeCliPkceSession: async () => ({
          ok: false,
          httpStatus: 401,
          envelope: errorEnvelope({
            code: "auth.invalid",
            message: "Authentication is invalid.",
            retryable: false,
          }),
        }),
      }),
      host: "https://insecur.test",
      options: { openBrowser: false },
    });

    expect(result).toMatchObject({
      ok: false,
      envelope: { error: { code: "auth.invalid" } },
    });
  });
});
