import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { runLoginCommand } from "../src/commands/login.js";
import { runInitCommand } from "../src/commands/init.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { PROJECT_CONFIG_FILE, USER_CONFIG_FILE } from "../src/config/paths.js";
import { clearMemorySession, getMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
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

const sensitiveCredential = "insecur-session-credential-test-value";

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
          sessionId: "sess_cli_test",
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
  };
}

function assertNoCredentialMaterial(contents: string): void {
  expect(contents).not.toContain(sensitiveCredential);
  expect(contents).not.toMatch(/"sessionToken"/);
  expect(contents).not.toMatch(/"refreshToken"/);
  expect(contents).not.toMatch(/"accessToken"/);
}

describe("no credential persistence", () => {
  let projectDir: string;

  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    delete process.env.INSECUR_WORKOS_COOKIE;
  });

  it("stores login credentials in memory only", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
      shell: false,
    });
    expect(getMemorySession()?.credential).toBe(sensitiveCredential);
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-"));
    const configPath = path.join(projectDir, PROJECT_CONFIG_FILE);
    const userConfigPath = path.join(projectDir, "home", USER_CONFIG_FILE);
    await expect(readFile(configPath)).rejects.toThrow();
    await expect(readFile(userConfigPath)).rejects.toThrow();
  });

  it("writes only opaque ids to project and user config during init", async () => {
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
      shell: false,
    });
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-"));
    const isolatedHome = await createIsolatedHome("insecur-cli-init-home-");
    try {
      await runInitCommand({ ...flags, configDir: projectDir }, createMockApi(), mockContext(), {
        profileSlug: "local-dev",
      });
      const projectConfig = await readFile(path.join(projectDir, PROJECT_CONFIG_FILE), "utf8");
      const userConfig = await readFile(
        path.join(isolatedHome.homeDir, ".insecur", USER_CONFIG_FILE),
        "utf8",
      );
      assertNoCredentialMaterial(projectConfig);
      assertNoCredentialMaterial(userConfig);
      expect(projectConfig).toContain("org_01TEST00000000000000000001");
      expect(userConfig).toContain("local-dev");
    } finally {
      isolatedHome.restore();
    }
  });
});
