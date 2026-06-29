import { successEnvelope } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import { runBrowserPkceLogin } from "../src/commands/login-pkce.js";
import type { GlobalCliFlags } from "../src/cli-options.js";

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

function createMockApi(): ApiClient {
  return {
    createCliAuthorizationUrl(input) {
      const callback = new URL(input.redirectUri);
      callback.searchParams.set("code", "code_pkce_test");
      callback.searchParams.set("state", input.state);
      completeLoginCallback(callback);
      return "https://insecur.test/v1/auth/cli/authorize";
    },
    async exchangeCliPkceSession(input) {
      expect(input.code).toBe("code_pkce_test");
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
});
