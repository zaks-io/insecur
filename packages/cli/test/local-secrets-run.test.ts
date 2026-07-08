import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cliProfileId,
  environmentId,
  projectId,
  type EnvironmentId,
  type ProjectId,
} from "@insecur/domain";
import { createFakeKeyStore } from "@insecur/local-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runLocalInitCommand } from "../src/commands/init-local.js";
import { runImportCommand } from "../src/commands/import.js";
import { runRunCommand } from "../src/commands/run.js";
import { runSecretsListCommand } from "../src/commands/secrets-list.js";
import { runSecretsSetCommand } from "../src/commands/secrets-set.js";
import { runSecretsVersionsCommand } from "../src/commands/secrets-versions.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { LOCAL_MODE_HOST } from "../src/config/local-mode.js";
import { PROJECT_CONFIG_FILE } from "../src/config/paths.js";
import { createLocalApiClient } from "../src/api/local-client.js";
import { openLocalStore } from "../src/local/open-local-store.js";
import {
  consumeLocalVariableKeyInjectionGrant,
  issueLocalVariableKeyInjectionGrant,
} from "../src/local/local-injection-grants.js";
import { CLI_CHILD_BASELINE_ENV_KEYS } from "../src/auth/child-env.js";
import { clearMemorySession } from "../src/session/memory-session.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const TEST_PROJECT_ID = projectId.brand("prj_01TEST00000000000000000001");
const TEST_ENV_ID = environmentId.brand("env_01TEST00000000000000000001");
const TEST_PROFILE_ID = cliProfileId.brand("prof_01TEST00000000000000000001");
const VARIABLE_KEY = "INSECUR_PROOF_SECRET";

const baseFlags = {
  host: undefined,
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

function createMockChild(exitCode: number) {
  const child = new EventEmitter() as EventEmitter & { stdout?: unknown; stderr?: unknown };
  queueMicrotask(() => {
    child.emit("close", exitCode, null);
  });
  return child;
}

async function initLocalProject(
  projectDir: string,
  homeDir: string,
  keyHex: string,
): Promise<ResolvedCliContext> {
  const exitCode = await runLocalInitCommand(
    { ...baseFlags, configDir: projectDir },
    {
      profileSlug: "local-dev",
      provision: {
        keyStore: createFakeKeyStore({ keyHex }),
        configHome: homeDir,
        mintProjectId: () => TEST_PROJECT_ID as ProjectId,
        mintEnvironmentId: () => TEST_ENV_ID as EnvironmentId,
      },
      mintProfileId: () => TEST_PROFILE_ID,
    },
  );
  expect(exitCode).toBe(0);
  const configRaw = await readFile(path.join(projectDir, PROJECT_CONFIG_FILE), "utf8");
  const projectConfig = JSON.parse(configRaw) as ResolvedCliContext["projectConfig"];
  return {
    projectConfig,
    userConfig: { profiles: {} },
    scope: {
      host: LOCAL_MODE_HOST,
      orgId: undefined,
      projectId: TEST_PROJECT_ID,
      envId: TEST_ENV_ID,
      profileId: TEST_PROFILE_ID,
      profileSlug: "local-dev",
      profile: undefined,
    },
  };
}

describe("local secrets set and run", () => {
  let projectDir: string;
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>>;
  let context: ResolvedCliContext;
  let keyHex: string;

  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    spawnMock.mockReset();
    isolatedHome?.restore();
  });

  async function setupProject(seedHex = "c".repeat(64)) {
    keyHex = seedHex;
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-local-loop-"));
    isolatedHome = await createIsolatedHome("insecur-cli-local-loop-home-");
    context = await initLocalProject(projectDir, isolatedHome.homeDir, keyHex);
  }

  function createLocalApi() {
    const store = openLocalStore({
      configHome: isolatedHome.homeDir,
      keyStore: createFakeKeyStore({ keyHex }),
    });
    return {
      api: createLocalApiClient({
        store,
        context,
        flags: { ...baseFlags, configDir: projectDir },
      }),
      dispose: () => {
        store.close();
      },
    };
  }

  it("writes a generated secret offline with metadata-only output", async () => {
    await setupProject();
    const { api, dispose } = createLocalApi();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const exitCode = await runSecretsSetCommand(
        { ...baseFlags, configDir: projectDir },
        api,
        context,
        {
          variableKey: VARIABLE_KEY,
          generateMode: "random",
          generateLength: "32",
          valueStdin: false,
          allowEmpty: false,
        },
      );
      expect(exitCode).toBe(0);
      const line = stdout.mock.calls[0]?.[0] as string;
      const parsed: unknown = JSON.parse(line);
      expect(JSON.stringify(parsed)).not.toMatch(/valueUtf8|encodedValueUtf8/);
      expect(parsed).toMatchObject({
        ok: true,
        data: {
          variableKey: VARIABLE_KEY,
          createdSecretShape: false,
        },
      });
    } finally {
      stdout.mockRestore();
      dispose();
    }
  });

  it("injects exactly the variable key and deny-by-default baseline env into the child", async () => {
    await setupProject();
    const { api, dispose } = createLocalApi();
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    spawnMock.mockImplementation((_executable, _args, options) => {
      capturedEnv = { ...(options?.env as NodeJS.ProcessEnv) };
      return createMockChild(0);
    });

    try {
      const setExit = await runSecretsSetCommand(
        { ...baseFlags, configDir: projectDir },
        api,
        context,
        {
          variableKey: VARIABLE_KEY,
          generateMode: "random",
          generateLength: "32",
          valueStdin: false,
          allowEmpty: false,
        },
      );
      expect(setExit).toBe(0);

      const exitCode = await runRunCommand({ ...baseFlags, configDir: projectDir }, api, context, {
        variableKey: VARIABLE_KEY,
        command: [
          "node",
          "-e",
          `process.stdout.write(JSON.stringify({ keys: Object.keys(process.env).sort() }))`,
        ],
      });
      expect(exitCode).toBe(0);
      expect(capturedEnv).toBeDefined();
      const allowedKeys = new Set<string>([...CLI_CHILD_BASELINE_ENV_KEYS, VARIABLE_KEY]);
      expect(Object.keys(capturedEnv ?? {}).every((name) => allowedKeys.has(name))).toBe(true);
      expect(capturedEnv?.[VARIABLE_KEY]?.length).toBeGreaterThanOrEqual(32);
      expect(JSON.stringify(capturedEnv)).not.toContain("INSECUR_SESSION_TOKEN");
    } finally {
      dispose();
    }
  });

  it("rejects replaying a consumed injection grant", async () => {
    await setupProject();
    const store = openLocalStore({
      configHome: isolatedHome.homeDir,
      keyStore: createFakeKeyStore({ keyHex }),
    });
    const { api, dispose } = {
      api: createLocalApiClient({
        store,
        context,
        flags: { ...baseFlags, configDir: projectDir },
      }),
      dispose: () => {
        store.close();
      },
    };

    try {
      await runSecretsSetCommand({ ...baseFlags, configDir: projectDir }, api, context, {
        variableKey: VARIABLE_KEY,
        generateMode: "random",
        generateLength: "32",
        valueStdin: false,
        allowEmpty: false,
      });

      const issued = await issueLocalVariableKeyInjectionGrant({
        store,
        projectId: TEST_PROJECT_ID,
        environmentId: TEST_ENV_ID,
        variableKey: VARIABLE_KEY as never,
      });
      expect(issued.ok).toBe(true);
      if (!issued.ok) {
        return;
      }

      const firstConsume = await consumeLocalVariableKeyInjectionGrant({
        store,
        projectId: TEST_PROJECT_ID,
        environmentId: TEST_ENV_ID,
        grantId: issued.envelope.data.grantId,
        variableKey: VARIABLE_KEY as never,
      });
      expect(firstConsume.ok).toBe(true);

      const replay = await consumeLocalVariableKeyInjectionGrant({
        store,
        projectId: TEST_PROJECT_ID,
        environmentId: TEST_ENV_ID,
        grantId: issued.envelope.data.grantId,
        variableKey: VARIABLE_KEY as never,
      });
      expect(replay.ok).toBe(false);
      if (replay.ok) {
        return;
      }
      expect(replay.envelope.error.code).toBe("injection.grant_denied");
    } finally {
      dispose();
    }
  });

  it("runs the First Value proof verifier without login", async () => {
    await setupProject();
    const { api, dispose } = createLocalApi();
    const verifyScript = path.join(process.cwd(), "examples/first-value-proof/verify.mjs");
    spawnMock.mockImplementation(() => createMockChild(0));

    try {
      const setExit = await runSecretsSetCommand(
        { ...baseFlags, configDir: projectDir },
        api,
        context,
        {
          variableKey: VARIABLE_KEY,
          generateMode: "random",
          generateLength: "32",
          valueStdin: false,
          allowEmpty: false,
        },
      );
      expect(setExit).toBe(0);

      const runExit = await runRunCommand({ ...baseFlags, configDir: projectDir }, api, context, {
        variableKey: VARIABLE_KEY,
        command: ["node", verifyScript],
      });
      expect(runExit).toBe(0);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const childEnv = spawnMock.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv;
      expect(childEnv[VARIABLE_KEY]?.length).toBeGreaterThanOrEqual(32);
    } finally {
      dispose();
    }
  });

  it("lists local secrets and current-version metadata", async () => {
    await setupProject();
    const { api, dispose } = createLocalApi();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      const setExit = await runSecretsSetCommand(
        { ...baseFlags, configDir: projectDir },
        api,
        context,
        {
          variableKey: VARIABLE_KEY,
          generateMode: "random",
          generateLength: "32",
          valueStdin: false,
          allowEmpty: false,
        },
      );
      expect(setExit).toBe(0);
      const setOutput = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        data: { secretId: string };
      };

      const listExit = await runSecretsListCommand({
        flags: { ...baseFlags, configDir: projectDir },
        api,
        context,
      });
      expect(listExit).toBe(0);
      const listOutput = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        data: { secrets: { variableKey: string; currentVersion?: unknown }[] };
      };
      expect(listOutput.data.secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variableKey: VARIABLE_KEY,
            currentVersion: expect.objectContaining({ versionNumber: 1 }),
          }),
        ]),
      );
      expect(JSON.stringify(listOutput)).not.toMatch(/valueUtf8|plaintext|ciphertext/i);

      const versionsExit = await runSecretsVersionsCommand(
        { flags: { ...baseFlags, configDir: projectDir }, api, context },
        { secretId: setOutput.data.secretId },
      );
      expect(versionsExit).toBe(0);
      const versionsOutput = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        data: { versions: { isCurrent: boolean; isPublished: boolean }[] };
      };
      expect(versionsOutput.data.versions).toEqual([
        expect.objectContaining({ isCurrent: true, isPublished: true }),
      ]);
      expect(JSON.stringify(versionsOutput)).not.toMatch(/valueUtf8|plaintext|ciphertext/i);
    } finally {
      stdout.mockRestore();
      dispose();
    }
  });

  it("imports a local dotenv file and injects the imported value", async () => {
    await setupProject();
    const { api, dispose } = createLocalApi();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    spawnMock.mockImplementation((_executable, _args, options) => {
      capturedEnv = { ...(options?.env as NodeJS.ProcessEnv) };
      return createMockChild(0);
    });

    try {
      const dotenvPath = path.join(projectDir, ".env.fixture");
      await writeFile(dotenvPath, "IMPORTED_API_KEY=imported-test-value\n", "utf8");
      const importExit = await runImportCommand(
        { ...baseFlags, configDir: projectDir },
        api,
        context,
        {
          filePath: dotenvPath,
          dryRun: false,
        },
      );
      expect(importExit).toBe(0);
      const importOutput = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        data: { importedCount: number; secrets: { variableKey: string }[] };
      };
      expect(importOutput.data.importedCount).toBe(1);
      expect(importOutput.data.secrets[0]?.variableKey).toBe("IMPORTED_API_KEY");
      expect(JSON.stringify(importOutput)).not.toContain("imported-test-value");

      const runExit = await runRunCommand({ ...baseFlags, configDir: projectDir }, api, context, {
        variableKey: "IMPORTED_API_KEY",
        command: ["node", "-e", "process.exit(0)"],
      });
      expect(runExit).toBe(0);
      expect(capturedEnv?.IMPORTED_API_KEY).toBe("imported-test-value");
      expect(JSON.stringify(capturedEnv)).not.toContain("INSECUR_SESSION_TOKEN");
    } finally {
      stdout.mockRestore();
      dispose();
    }
  });
});
