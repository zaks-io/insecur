import { chmod, mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { runInitCommand } from "../src/commands/init.js";
import { runLoginCommand } from "../src/commands/login.js";
import { runLogoutCommand } from "../src/commands/logout.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { PROJECT_CONFIG_FILE } from "../src/config/paths.js";
import { clearMemorySession } from "../src/session/memory-session.js";
import { requireSessionCredential } from "../src/auth/require-session.js";
import {
  clearCachedSession,
  readCachedSession,
  sessionCachePath,
} from "../src/session/session-cache.js";
import { resetSessionCredentialCacheForTests } from "../src/session/resolve-session.js";
import type { ApiClient } from "../src/api/types.js";

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
  };
}

describe("CLI session handoff across separate commands", () => {
  let cacheDir: string;
  let originalCacheFile: string | undefined;

  afterEach(async () => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    delete process.env.INSECUR_WORKOS_COOKIE;
    resetSessionCredentialCacheForTests();
    await clearCachedSession();
    if (originalCacheFile === undefined) {
      delete process.env.INSECUR_SESSION_CACHE_FILE;
    } else {
      process.env.INSECUR_SESSION_CACHE_FILE = originalCacheFile;
    }
  });

  async function useIsolatedSessionCache(): Promise<void> {
    cacheDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-session-"));
    originalCacheFile = process.env.INSECUR_SESSION_CACHE_FILE;
    process.env.INSECUR_SESSION_CACHE_FILE = path.join(cacheDir, "session.json");
    resetSessionCredentialCacheForTests();
  }

  it("persists login to the session cache with mode 0600", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    const cacheFile = sessionCachePath();
    const contents = await readFile(cacheFile, "utf8");
    expect(contents).toContain("sess_handoff_test");
    const cached = await readCachedSession();
    expect(cached?.credential).toBe(mockCredential);
    const fileStat = await stat(cacheFile);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("resolves credentials from the session cache in a fresh process context", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    clearMemorySession();
    resetSessionCredentialCacheForTests();
    await expect(requireSessionCredential({ host: flags.host })).resolves.toBe(mockCredential);
  });

  it("lets init run after login when only the session cache survives", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    clearMemorySession();
    resetSessionCredentialCacheForTests();
    const projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-init-"));
    const homeDir = path.join(projectDir, "home");
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;
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
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it("prefers INSECUR_SESSION_TOKEN over the session cache", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    process.env.INSECUR_SESSION_TOKEN = "env-override-token";
    clearMemorySession();
    resetSessionCredentialCacheForTests();
    await expect(requireSessionCredential({ host: flags.host })).resolves.toBe(
      "env-override-token",
    );
  });

  it("clears the session cache on logout", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    await runLogoutCommand(flags);
    await expect(readCachedSession()).resolves.toBeUndefined();
    clearMemorySession();
    resetSessionCredentialCacheForTests();
    await expect(requireSessionCredential({ host: flags.host })).rejects.toMatchObject({
      message: "Authentication is required. Run insecur login first.",
    });
  });

  it("clears the session cache when the resolved host does not match the cached login host", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext("https://insecur-a.test"), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    clearMemorySession();
    resetSessionCredentialCacheForTests();
    await expect(
      requireSessionCredential({ host: "https://insecur-b.test" }),
    ).rejects.toMatchObject({
      message: "Authentication is required. Run insecur login first.",
    });
    await expect(readCachedSession()).resolves.toBeUndefined();
  });

  it("rejects init when the session cache host does not match the command host", async () => {
    await useIsolatedSessionCache();
    process.env.INSECUR_WORKOS_COOKIE = "wos-session=test";
    await runLoginCommand(flags, createMockApi(), mockContext("https://insecur-a.test"), {
      cookieEnv: "INSECUR_WORKOS_COOKIE",
      csrfEnv: "INSECUR_WORKOS_CSRF",
    });
    clearMemorySession();
    resetSessionCredentialCacheForTests();
    await expect(
      runInitCommand(
        { ...flags, host: "https://insecur-b.test" },
        createMockApi(),
        mockContext("https://insecur-b.test"),
        { profileSlug: "local-dev" },
      ),
    ).rejects.toMatchObject({
      message: "Authentication is required. Run insecur login first.",
    });
  });

  it("drops expired session cache entries", async () => {
    await useIsolatedSessionCache();
    const cacheFile = sessionCachePath();
    await chmod(path.dirname(cacheFile), 0o700);
    const expiredPayload = {
      version: 1,
      host: flags.host,
      sessionId: "sess_expired",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      credential: mockCredential,
    };
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(expiredPayload)}\n`, { mode: 0o600 });
    resetSessionCredentialCacheForTests();
    await expect(readCachedSession()).resolves.toBeUndefined();
    await expect(stat(cacheFile)).rejects.toThrow();
  });
});
