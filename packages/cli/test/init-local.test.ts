import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cliProfileId,
  environmentId,
  projectId,
  type EnvironmentId,
  type ProjectId,
} from "@insecur/domain";
import { createFakeKeyStore, LOCAL_STORE_DB_FILE_NAME } from "@insecur/local-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInitCommand } from "../src/commands/init.js";
import { runLocalInitCommand } from "../src/commands/init-local.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { LOCAL_INIT_NOTICE } from "../src/local/local-init-notice.js";
import { PROJECT_CONFIG_FILE } from "../src/config/paths.js";
import { clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const TEST_PROJECT_ID = projectId.brand("prj_01TEST00000000000000000001");
const TEST_ENV_ID = environmentId.brand("env_01TEST00000000000000000001");
const TEST_PROFILE_ID = cliProfileId.brand("prof_01TEST00000000000000000001");

const flags = {
  host: undefined,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: false,
  verbose: false,
};

const mockContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
  scope: {
    host: "https://api.insecur.cloud",
    orgId: undefined,
    projectId: undefined,
    envId: undefined,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

const provisionSpy = vi.fn();

const noopApi: ApiClient = {
  createCliAuthorizationUrl: () => "https://insecur.test/v1/auth/cli/authorize",
  exchangeCliPkceSession: async () => {
    throw new Error("not used");
  },
  provisionPersonalOrganization: async (...args) => {
    provisionSpy(...args);
    throw new Error("network should not be called for local init");
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
  revokeCliSession: async () => {
    throw new Error("not used");
  },
  sessionWhoami: async () => {
    throw new Error("not used");
  },
};

const expectedConfig = `{
  "host": "local",
  "projectId": "${TEST_PROJECT_ID}",
  "defaultEnvId": "${TEST_ENV_ID}",
  "profileId": "${TEST_PROFILE_ID}",
  "secretShapes": [
    {
      "variableKey": "INSECUR_PROOF_SECRET",
      "displayName": "First value proof",
      "generationHint": "random:32"
    }
  ]
}
`;

const localInitOptions = {
  profileSlug: "local-dev",
  provision: {
    keyStore: createFakeKeyStore({ keyHex: "a".repeat(64) }),
    mintProjectId: () => TEST_PROJECT_ID as ProjectId,
    mintEnvironmentId: () => TEST_ENV_ID as EnvironmentId,
  },
  mintProfileId: () => TEST_PROFILE_ID,
};

describe("local init", () => {
  let projectDir: string;
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>>;

  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    provisionSpy.mockClear();
    isolatedHome?.restore();
  });

  it("writes committable local project config with secret shape manifest", async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-local-init-"));
    isolatedHome = await createIsolatedHome("insecur-cli-local-init-home-");

    const exitCode = await runLocalInitCommand(
      { ...flags, configDir: projectDir },
      {
        ...localInitOptions,
        provision: {
          ...localInitOptions.provision,
          configHome: isolatedHome.homeDir,
        },
      },
    );

    expect(exitCode).toBe(0);
    const configRaw = await readFile(path.join(projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(configRaw).toBe(expectedConfig);
    expect(configRaw).not.toMatch(/"orgId"/);
    expect(configRaw).not.toMatch(/"token"/);
  });

  it("includes the Local Mode notice in JSON output", async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-local-init-json-"));
    isolatedHome = await createIsolatedHome("insecur-cli-local-init-json-home-");
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });

    try {
      await runLocalInitCommand(
        { ...flags, configDir: projectDir },
        {
          ...localInitOptions,
          provision: {
            ...localInitOptions.provision,
            keyStore: createFakeKeyStore({ keyHex: "b".repeat(64) }),
            configHome: isolatedHome.homeDir,
          },
        },
      );
      const output = JSON.parse(stdoutChunks.join("")) as {
        data: { notice: string; projectId: string };
        next: { id: string; actor: string; argv: string[] }[];
      };
      expect(output.data.notice).toBe(LOCAL_INIT_NOTICE);
      expect(output.data.projectId).toBe(TEST_PROJECT_ID);
      expect(output.next[0]).toEqual({
        id: "create-proof-secret",
        actor: "agent",
        kind: "execute",
        argv: [
          "insecur",
          "secrets",
          "set",
          "INSECUR_PROOF_SECRET",
          "--generate",
          "random",
          "--length",
          "32",
          "--json",
        ],
      });
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("routes unauthenticated init through Local Mode without network calls", async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-init-route-"));
    isolatedHome = await createIsolatedHome("insecur-cli-init-route-home-");
    process.env.INSECUR_CONFIG_HOME = isolatedHome.homeDir;

    const exitCode = await runInitCommand(
      { ...flags, configDir: projectDir },
      noopApi,
      mockContext,
      {
        ...localInitOptions,
        provision: {
          ...localInitOptions.provision,
          configHome: path.join(isolatedHome.homeDir, ".insecur"),
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(provisionSpy).not.toHaveBeenCalled();
    const configRaw = await readFile(path.join(projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(configRaw).toContain('"host": "local"');
    expect(configRaw).toContain('"secretShapes"');
    expect(configRaw).not.toContain('"orgId"');
    await expect(
      stat(path.join(isolatedHome.homeDir, ".insecur", LOCAL_STORE_DB_FILE_NAME)),
    ).resolves.toBeDefined();
    await expect(
      stat(path.join(isolatedHome.homeDir, LOCAL_STORE_DB_FILE_NAME)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
