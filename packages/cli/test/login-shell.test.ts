import { afterEach, describe, expect, it, vi } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { runLoginCommand } from "../src/commands/login.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { clearMemorySession, getMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { CliError } from "../src/output/cli-error.js";

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

function createMockApi(): ApiClient {
  return {
    async exchangeCliSession() {
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
  };
}

function assertNoCredentialMaterial(contents: string): void {
  expect(contents).not.toContain(sensitiveCredential);
  expect(contents).not.toMatch(/"sessionToken"/);
  expect(contents).not.toMatch(/"refreshToken"/);
  expect(contents).not.toMatch(/"accessToken"/);
}

describe("login --shell managed session", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_WORKOS_COOKIE;
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.clearAllMocks();
  });

  it("hands the credential to a managed child shell without parent memory retention", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    spawnMock.mockResolvedValue(0);

    const exitCode = await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
      shell: true,
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
  });

  it("writes session metadata to stderr only and never prints the credential", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    spawnMock.mockResolvedValue(0);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runLoginCommand({ ...flags, quiet: false }, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
      shell: true,
    });

    const stderrOutput = stderr.mock.calls.map((call) => String(call[0])).join("");
    const stdoutOutput = stdout.mock.calls.map((call) => String(call[0])).join("");
    assertNoCredentialMaterial(stderrOutput);
    assertNoCredentialMaterial(stdoutOutput);
    expect(stderrOutput).toContain("sess_cli_managed");
    expect(stderrOutput).toContain("Starting authenticated shell");
  });

  it("rejects --shell with --json", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";

    await expect(
      runLoginCommand({ ...flags, json: true }, createMockApi(), mockContext(), {
        cookieEnv: "INSECUR_WORKOS_COOKIE",
        csrfEnv: "INSECUR_WORKOS_CSRF",
        shell: true,
      }),
    ).rejects.toMatchObject({
      exitCode: EXIT_VALIDATION,
    } satisfies Partial<CliError>);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(getMemorySession()).toBeUndefined();
  });

  it("returns the managed shell exit code", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    spawnMock.mockResolvedValue(42);

    const exitCode = await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
      shell: true,
    });

    expect(exitCode).toBe(42);
  });
});

describe("buildLoginShellChildEnv", () => {
  it("strips deploy and oidc tokens from the child environment", async () => {
    const { buildLoginShellChildEnv } = await import("../src/commands/shell-env.js");
    process.env.INSECUR_DEPLOY_KEY = "deploy-key";
    process.env.INSECUR_OIDC_TOKEN = "oidc-token";

    const childEnv = buildLoginShellChildEnv("credential", "https://insecur.test");

    expect(childEnv.INSECUR_SESSION_TOKEN).toBe("credential");
    expect(childEnv.INSECUR_HOST).toBe("https://insecur.test");
    expect(childEnv.INSECUR_DEPLOY_KEY).toBeUndefined();
    expect(childEnv.INSECUR_OIDC_TOKEN).toBeUndefined();

    delete process.env.INSECUR_DEPLOY_KEY;
    delete process.env.INSECUR_OIDC_TOKEN;
  });
});
