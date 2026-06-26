import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { runInitCommand } from "../src/commands/init.js";
import { runLoginCommand } from "../src/commands/login.js";
import { runLogoutCommand } from "../src/commands/logout.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { PROJECT_CONFIG_FILE } from "../src/config/paths.js";
import { requireSessionCredential } from "../src/auth/require-session.js";
import { clearMemorySession, getMemorySession } from "../src/session/memory-session.js";
import { clearSessionCredentialHandoff } from "../src/session/resolve-session.js";
import type { ApiClient } from "../src/api/types.js";
import { CliError } from "../src/output/cli-error.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

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

const mockCredential = "credential_test";

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
        credential: mockCredential,
        envelope: successEnvelope({
          sessionId: "sess_handoff_test",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      };
    },
    async provisionPersonalOrganization() {
      return {
        ok: true,
        envelope: successEnvelope({
          organizationId: "org_01TEST00000000000000000001",
          defaultTeamId: "team_01TEST0000000000000000001",
          ownerMembershipId: "mem_01TEST0000000000000000001",
          projectId: "prj_01TEST00000000000000000001",
          developmentEnvironmentId: "env_01TEST0000000000000000001",
        }),
      };
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

describe("CLI session handoff across separate commands", () => {
  afterEach(() => {
    clearSessionCredentialHandoff();
    delete process.env.INSECUR_SESSION_TOKEN;
    delete process.env.INSECUR_HOST;
    delete process.env.INSECUR_WORKOS_COOKIE;
    vi.restoreAllMocks();
  });

  it("stores login in process memory without writing a session cache file", async () => {
    const isolatedHome = await createIsolatedHome("insecur-cli-session-home-");
    try {
      process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
      await runLoginCommand(flags, createMockApi(), mockContext(), {
        cookieEnv: "INSECUR_WORKOS_COOKIE",
        csrfEnv: "INSECUR_WORKOS_CSRF",
      });
      expect(getMemorySession()?.credential).toBe(mockCredential);
      await expect(
        readFile(path.join(isolatedHome.homeDir, ".insecur", "session.json")),
      ).rejects.toThrow();
    } finally {
      isolatedHome.restore();
    }
  });

  it("prints shell export assignments with --print-export", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand({ ...flags, json: false, quiet: true }, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
      printExport: true,
    });
    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain("export INSECUR_SESSION_TOKEN=");
    expect(output).toContain("export INSECUR_HOST=");
    expect(output).toContain(mockCredential);
  });

  it("resolves credentials from INSECUR_SESSION_TOKEN in a fresh process context", () => {
    process.env.INSECUR_SESSION_TOKEN = mockCredential;
    clearMemorySession();
    expect(requireSessionCredential({ host: flags.host })).toBe(mockCredential);
  });

  it("lets init run after login when only INSECUR_SESSION_TOKEN survives", async () => {
    process.env.INSECUR_SESSION_TOKEN = mockCredential;
    clearMemorySession();
    const projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-init-"));
    const isolatedHome = await createIsolatedHome("insecur-cli-init-home-");
    try {
      const exitCode = await runInitCommand(
        { ...flags, configDir: projectDir },
        createMockApi(),
        mockContext(),
        { profileSlug: "local-dev" },
      );
      expect(exitCode).toBe(0);
      await expect(readFile(path.join(projectDir, PROJECT_CONFIG_FILE), "utf8")).resolves.toContain(
        "org_01TEST00000000000000000001",
      );
    } finally {
      isolatedHome.restore();
    }
  });

  it("prefers process memory over INSECUR_SESSION_TOKEN", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    process.env.INSECUR_SESSION_TOKEN = "env-override-token";
    expect(requireSessionCredential({ host: flags.host })).toBe(mockCredential);
  });

  it("clears process memory on logout", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    runLogoutCommand(flags);
    expect(getMemorySession()).toBeUndefined();
    expect(() => requireSessionCredential({ host: flags.host })).toThrow(CliError);
  });

  it("rejects --print-export combined with --json", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await expect(
      runLoginCommand(flags, createMockApi(), mockContext(), {
        cookieEnv: "INSECUR_WORKOS_COOKIE",
        csrfEnv: "INSECUR_WORKOS_CSRF",
        printExport: true,
      }),
    ).rejects.toMatchObject({
      message: "insecur login --print-export cannot be combined with --json.",
    });
  });
});
