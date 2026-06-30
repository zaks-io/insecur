import { afterEach, describe, expect, it, vi } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { runLoginCommand } from "../src/commands/login.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import type { CliUserProfile } from "../src/config/user-config.js";
import { clearMemorySession, getMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { CliError } from "../src/output/cli-error.js";
import { CLI_CHILD_BASELINE_ENV_KEYS } from "../src/auth/child-env.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("../src/commands/managed-shell.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/managed-shell.js")>();
  return {
    ...actual,
    runInteractiveShell: spawnMock,
  };
});

const sensitiveCredential = "insecur-session-credential-managed-shell";

const flags = {
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

function mockContext(host = flags.host): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: { profiles: {} },
    scope: {
      host,
      orgId: undefined,
      projectId: undefined,
      envId: undefined,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

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
      callback.searchParams.set("code", "code_mock_login");
      callback.searchParams.set("state", input.state);
      completeLoginCallback(callback);
      return "https://workos.test/authorize";
    },
    async exchangeCliPkceSession(input) {
      expect(input.code).toBe("code_mock_login");
      return {
        ok: true,
        credential: sensitiveCredential,
        envelope: successEnvelope({
          sessionId: "sess_cli_managed",
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

function assertNoCredentialMaterial(contents: string): void {
  expect(contents).not.toContain(sensitiveCredential);
  expect(contents).not.toMatch(/"sessionToken"/);
  expect(contents).not.toMatch(/"refreshToken"/);
  expect(contents).not.toMatch(/"accessToken"/);
}

function expectOnlyAuthenticatedShellEnvKeys(
  childEnv: NodeJS.ProcessEnv,
  extraKeys: readonly string[],
): void {
  const allowedKeys = new Set<string>([...CLI_CHILD_BASELINE_ENV_KEYS, ...extraKeys]);
  expect(Object.keys(childEnv).every((name) => allowedKeys.has(name))).toBe(true);
}

describe("login --shell managed session", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    delete process.env.INSECUR_DEPLOY_KEY;
    delete process.env.INSECUR_OIDC_TOKEN;
    delete process.env.INSECUR_FUTURE_TOKEN;
    delete process.env.INSECUR_FUTURE_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.OTHER_TOKEN;
    delete process.env.GITHUB_TOKEN;
    vi.clearAllMocks();
  });

  it("hands the credential to a managed child shell without parent memory retention", async () => {
    spawnMock.mockResolvedValue(0);

    const exitCode = await runLoginCommand(flags, createMockApi(), mockContext(), {
      shell: true,
      openBrowser: false,
    });

    expect(exitCode).toBe(0);
    expect(getMemorySession()).toBeUndefined();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const childEnv = spawnMock.mock.calls[0]?.[1] as NodeJS.ProcessEnv;
    expect(childEnv.INSECUR_SESSION_TOKEN).toBe(sensitiveCredential);
    expect(childEnv.INSECUR_HOST).toBe("https://insecur.test");
    expect(childEnv.INSECUR_ORG).toBeUndefined();
    expect(childEnv.INSECUR_PROJECT).toBeUndefined();
    expect(childEnv.INSECUR_ENV).toBeUndefined();
    expect(childEnv.INSECUR_PROFILE).toBeUndefined();
    expectOnlyAuthenticatedShellEnvKeys(childEnv, ["INSECUR_SESSION_TOKEN", "INSECUR_HOST"]);
  });

  it("uses PKCE loopback login by default", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const api: ApiClient = {
      createCliAuthorizationUrl(input) {
        const callback = new URL(input.redirectUri);
        callback.searchParams.set("code", "code_pkce_test");
        callback.searchParams.set("state", input.state);
        completeLoginCallback(callback);
        return "https://workos.test/authorize";
      },
      async exchangeCliPkceSession(input) {
        expect(input.code).toBe("code_pkce_test");
        expect(input.codeVerifier.length).toBeGreaterThan(40);
        return {
          ok: true,
          credential: sensitiveCredential,
          envelope: successEnvelope({
            sessionId: "sess_cli_pkce",
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

    const exitCode = await runLoginCommand(flags, api, mockContext(), {
      shell: false,
      openBrowser: false,
    });

    expect(exitCode).toBe(0);
    expect(getMemorySession()?.credential).toBe(sensitiveCredential);
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain(
      "https://workos.test/authorize",
    );
  });

  it("writes session metadata to stderr only and never prints the credential", async () => {
    spawnMock.mockResolvedValue(0);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runLoginCommand({ ...flags, quiet: false }, createMockApi(), mockContext(), {
      shell: true,
      openBrowser: false,
    });

    const stderrOutput = stderr.mock.calls.map((call) => String(call[0])).join("");
    const stdoutOutput = stdout.mock.calls.map((call) => String(call[0])).join("");
    assertNoCredentialMaterial(stderrOutput);
    assertNoCredentialMaterial(stdoutOutput);
    expect(stderrOutput).toContain("sess_cli_managed");
    expect(stderrOutput).toContain("Starting authenticated shell");
  });

  it("rejects --shell with --json", async () => {
    await expect(
      runLoginCommand({ ...flags, json: true }, createMockApi(), mockContext(), {
        shell: true,
        openBrowser: false,
      }),
    ).rejects.toMatchObject({
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(getMemorySession()).toBeUndefined();
  });

  it("returns the managed shell exit code", async () => {
    spawnMock.mockResolvedValue(42);

    const exitCode = await runLoginCommand(flags, createMockApi(), mockContext(), {
      shell: true,
      openBrowser: false,
    });

    expect(exitCode).toBe(42);
  });
});

describe("buildLoginShellChildEnv", () => {
  it("passes only baseline env, host, and the intended session token", async () => {
    const { buildLoginShellChildEnv } = await import("../src/commands/shell-env.js");
    const childEnv = buildLoginShellChildEnv("credential", "https://insecur.test", {
      env: {
        PATH: "/usr/bin",
        SHELL: "/bin/bash",
        INSECUR_DEPLOY_KEY: "deploy-key",
        INSECUR_OIDC_TOKEN: "oidc-token",
        INSECUR_FUTURE_COOKIE: "dummy-future-cookie",
        INSECUR_FUTURE_CSRF: "dummy-future-csrf",
        INSECUR_FUTURE_TOKEN: "dummy-future-token",
        INSECUR_FUTURE_KEY: "dummy-future-key",
        OPENAI_API_KEY: "dummy-openai",
        AWS_SECRET_ACCESS_KEY: "dummy-aws",
        OTHER_TOKEN: "dummy-other",
        GITHUB_TOKEN: "dummy-github",
      },
    });

    expect(childEnv.INSECUR_SESSION_TOKEN).toBe("credential");
    expect(childEnv.INSECUR_HOST).toBe("https://insecur.test");
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_OIDC_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_COOKIE).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_CSRF).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_KEY).toBeUndefined();
    expect(childEnv.OPENAI_API_KEY).toBeUndefined();
    expect(childEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(childEnv.OTHER_TOKEN).toBeUndefined();
    expect(childEnv.GITHUB_TOKEN).toBeUndefined();
    expect(childEnv.PATH).toBe("/usr/bin");
    expect(childEnv.SHELL).toBe("/bin/bash");
    expect(Object.keys(childEnv).sort()).toEqual(
      ["INSECUR_HOST", "INSECUR_SESSION_TOKEN", "PATH", "SHELL"].sort(),
    );
  });
});

describe("buildShellChildEnv", () => {
  it("passes only baseline env, profile metadata, and the intended session token", async () => {
    const { buildShellChildEnv } = await import("../src/commands/shell-env.js");
    const profile: CliUserProfile = {
      slug: "local-dev",
      displayName: "Local Dev" as never,
      host: "https://insecur.test",
      orgId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      envId: "env_01TEST00000000000000000001" as never,
    };
    const childEnv = buildShellChildEnv("credential", profile, {
      env: {
        PATH: "/usr/bin",
        TERM: "xterm-256color",
        INSECUR_DEPLOY_KEY: "deploy-key",
        INSECUR_OIDC_TOKEN: "oidc-token",
        INSECUR_FUTURE_COOKIE: "dummy-future-cookie",
        INSECUR_FUTURE_CSRF: "dummy-future-csrf",
        INSECUR_FUTURE_TOKEN: "dummy-future-token",
        INSECUR_FUTURE_KEY: "dummy-future-key",
        OPENAI_API_KEY: "dummy-openai",
        AWS_SECRET_ACCESS_KEY: "dummy-aws",
        OTHER_TOKEN: "dummy-other",
        GITHUB_TOKEN: "dummy-github",
      },
    });

    expect(childEnv.INSECUR_SESSION_TOKEN).toBe("credential");
    expect(childEnv.INSECUR_HOST).toBe(profile.host);
    expect(childEnv.INSECUR_ORG).toBe(profile.orgId);
    expect(childEnv.INSECUR_PROJECT).toBe(profile.projectId);
    expect(childEnv.INSECUR_ENV).toBe(profile.envId);
    expect(childEnv.INSECUR_PROFILE).toBe(profile.slug);
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_OIDC_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_COOKIE).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_CSRF).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_TOKEN).toBeUndefined();
    expect(childEnv.INSECUR_FUTURE_KEY).toBeUndefined();
    expect(childEnv.OPENAI_API_KEY).toBeUndefined();
    expect(childEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(childEnv.OTHER_TOKEN).toBeUndefined();
    expect(childEnv.GITHUB_TOKEN).toBeUndefined();
    expect(childEnv.PATH).toBe("/usr/bin");
    expect(childEnv.TERM).toBe("xterm-256color");
    expect(Object.keys(childEnv).sort()).toEqual(
      [
        "INSECUR_ENV",
        "INSECUR_HOST",
        "INSECUR_PROFILE",
        "INSECUR_PROJECT",
        "INSECUR_ORG",
        "INSECUR_SESSION_TOKEN",
        "PATH",
        "TERM",
      ].sort(),
    );
  });
});
