import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { environmentId, projectId, type VariableKey } from "@insecur/domain";
import { createFakeKeyStore } from "@insecur/local-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalApiClient } from "../src/api/local-client.js";
import { loadAndResolveCliContext } from "../src/config/load-cli-context.js";
import { PROJECT_CONFIG_FILE } from "../src/config/paths.js";
import { runInitCommand } from "../src/commands/init.js";
import { runRunCommand } from "../src/commands/run.js";
import { runSecretsSetCommand } from "../src/commands/secrets-set.js";
import { adoptLocalProjectFromConfig } from "../src/local/adopt-local-project.js";
import { LOCAL_MODE_MACHINE_SCOPED_LINE, secretsSetArgv } from "../src/local/local-value-report.js";
import { openLocalStore } from "../src/local/open-local-store.js";
import { CliError } from "../src/output/cli-error.js";
import { NOOP_CRASH_REPORTER } from "../src/crash-reporting.js";
import { renderCliRunFailure } from "../src/output/render-cli-run-failure.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const CLONED_PROJECT_ID = projectId.brand("prj_01TESTADOPT000000000000001");
const CLONED_ENV_ID = environmentId.brand("env_01TESTADOPT000000000000001");
const CLONED_PROFILE_ID = "prof_01TESTADOPT000000000000001";
const KEY_HEX = "d".repeat(64);

const COMMITTED_CONFIG = {
  host: "local",
  projectId: CLONED_PROJECT_ID,
  defaultEnvId: CLONED_ENV_ID,
  profileId: CLONED_PROFILE_ID,
  secretShapes: [
    {
      variableKey: "INSECUR_PROOF_SECRET",
      displayName: "First value proof",
      generationHint: "random:32",
    },
    { variableKey: "DATABASE_URL", displayName: "Database URL", required: true },
    { variableKey: "SERVICE_TOKEN", description: "Token for the worker" },
  ],
} as const;

const MANIFEST_KEYS = COMMITTED_CONFIG.secretShapes.map((shape) => shape.variableKey);

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
  const child = new EventEmitter();
  queueMicrotask(() => {
    child.emit("close", exitCode, null);
  });
  return child;
}

describe("local project auto-adopt and per-machine missing-value report", () => {
  let projectDir: string;
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>>;

  afterEach(() => {
    spawnMock.mockReset();
    isolatedHome?.restore();
  });

  /** A fresh clone: committed config exists, this machine's store has never seen the project. */
  async function setupClonedProject() {
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-adopt-"));
    isolatedHome = await createIsolatedHome("insecur-cli-adopt-home-");
    await writeFile(
      path.join(projectDir, PROJECT_CONFIG_FILE),
      JSON.stringify(COMMITTED_CONFIG, null, 2),
      "utf8",
    );
    return loadAndResolveCliContext({ ...baseFlags, configDir: projectDir });
  }

  function openStore() {
    return openLocalStore({
      configHome: isolatedHome.homeDir,
      keyStore: createFakeKeyStore({ keyHex: KEY_HEX }),
    });
  }

  function createLocalApi(context: Awaited<ReturnType<typeof loadAndResolveCliContext>>) {
    const store = openStore();
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

  async function setAllManifestKeys(context: Awaited<ReturnType<typeof loadAndResolveCliContext>>) {
    for (const variableKey of MANIFEST_KEYS) {
      const { api, dispose } = createLocalApi(context);
      try {
        const exitCode = await runSecretsSetCommand(
          { ...baseFlags, configDir: projectDir },
          api,
          context,
          {
            variableKey,
            generateMode: "random",
            generateLength: "32",
            valueStdin: false,
            allowEmpty: false,
          },
        );
        expect(exitCode).toBe(0);
      } finally {
        dispose();
      }
    }
  }

  async function runProofCommand(context: Awaited<ReturnType<typeof loadAndResolveCliContext>>) {
    const { api, dispose } = createLocalApi(context);
    try {
      return await runRunCommand({ ...baseFlags, configDir: projectDir }, api, context, {
        variableKey: "INSECUR_PROOF_SECRET",
        command: ["node", "-e", "process.exit(0)"],
      });
    } finally {
      dispose();
    }
  }

  it("auto-adopts on first run and fails with the full missing-value report", async () => {
    const context = await setupClonedProject();

    let thrown: unknown;
    try {
      await runProofCommand(context);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CliError);
    const cliError = thrown as CliError;
    expect(cliError.code).toBe("local.value_missing_on_machine");
    expect(cliError.exitCode).toBe(2);
    expect(cliError.message).toContain("0 of 3 manifest keys have values on this machine.");
    expect(cliError.message).toContain(LOCAL_MODE_MACHINE_SCOPED_LINE);

    const missingValues = cliError.remediation?.missingValues ?? [];
    expect(missingValues.map((entry) => entry.variableKey)).toEqual([...MANIFEST_KEYS].sort());
    expect(missingValues.map((entry) => entry.argv)).toEqual([
      ["insecur", "secrets", "set", "DATABASE_URL"],
      [
        "insecur",
        "secrets",
        "set",
        "INSECUR_PROOF_SECRET",
        "--generate",
        "random",
        "--length",
        "32",
      ],
      ["insecur", "secrets", "set", "SERVICE_TOKEN"],
    ]);
    expect(cliError.remediation?.login).toEqual(["insecur", "login"]);
    expect(cliError.remediation?.migrate).toEqual([
      "insecur",
      "projects",
      "migrate",
      "--confirm-migrate",
    ]);

    const store = openStore();
    try {
      expect(await store.projects.getProject(CLONED_PROJECT_ID)).not.toBeNull();
      expect(await store.projects.getEnvironment(CLONED_PROJECT_ID, CLONED_ENV_ID)).not.toBeNull();
      const shapes = await store.projects.listSecretShapes(CLONED_PROJECT_ID);
      expect(shapes.map((shape) => shape.variableKey).sort()).toEqual([...MANIFEST_KEYS].sort());
    } finally {
      store.close();
    }
  });

  it("renders metadata-only JSON and human failure output with per-key next actions", async () => {
    const context = await setupClonedProject();
    let thrown: unknown;
    try {
      await runProofCommand(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CliError);

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const jsonExit = await renderCliRunFailure(
        thrown,
        { json: true, quiet: false, verbose: false, color: undefined },
        NOOP_CRASH_REPORTER,
      );
      expect(jsonExit).toBe(2);
      const envelope = JSON.parse(String(stderr.mock.calls[0]?.[0])) as {
        ok: boolean;
        error: { code: string; message: string };
        remediation: { missingValues: { variableKey: string; argv: string[] }[] };
        next: { id: string; kind: string; actor: string; argv: string[] }[];
      };
      expect(envelope.ok).toBe(false);
      expect(envelope.error.code).toBe("local.value_missing_on_machine");
      expect(envelope.error.message).toContain(LOCAL_MODE_MACHINE_SCOPED_LINE);
      expect(envelope.remediation.missingValues).toHaveLength(3);
      const setActions = envelope.next.filter((action) => action.id.startsWith("set-value:"));
      expect(setActions.map((action) => action.argv)).toEqual(
        envelope.remediation.missingValues.map((entry) => entry.argv),
      );
      expect(JSON.stringify(envelope)).not.toMatch(/valueUtf8|plaintext|ciphertext/i);

      stderr.mockClear();
      const humanExit = await renderCliRunFailure(
        thrown,
        { json: false, quiet: false, verbose: false, color: undefined },
        NOOP_CRASH_REPORTER,
      );
      expect(humanExit).toBe(2);
      const humanOutput = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(humanOutput).toContain(LOCAL_MODE_MACHINE_SCOPED_LINE);
      for (const variableKey of MANIFEST_KEYS) {
        expect(humanOutput).toContain(`insecur secrets set ${variableKey}`);
      }
    } finally {
      stderr.mockRestore();
    }
  });

  it("succeeds unchanged after the missing keys are set", async () => {
    const context = await setupClonedProject();
    await expect(runProofCommand(context)).rejects.toMatchObject({
      code: "local.value_missing_on_machine",
    });

    await setAllManifestKeys(context);
    spawnMock.mockImplementation(() => createMockChild(0));

    const exitCode = await runProofCommand(context);
    expect(exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("keeps adoption idempotent and silent for already-known projects", async () => {
    const context = await setupClonedProject();
    await setAllManifestKeys(context);

    const store = openStore();
    try {
      const firstShapes = await store.projects.listSecretShapes(CLONED_PROJECT_ID);
      const again = await adoptLocalProjectFromConfig({
        store,
        projectConfig: context.projectConfig,
        projectId: CLONED_PROJECT_ID,
        environmentId: CLONED_ENV_ID,
      });
      expect(again).toEqual({ adoptedProject: false, adoptedEnvironment: false });
      const secondShapes = await store.projects.listSecretShapes(CLONED_PROJECT_ID);
      expect(secondShapes).toEqual(firstShapes);
    } finally {
      store.close();
    }
  });

  it("does not adopt when the committed config does not own the requested project", async () => {
    const context = await setupClonedProject();
    const otherProjectId = projectId.brand("prj_01TESTADOPT000000000000002");
    const store = openStore();
    try {
      const result = await adoptLocalProjectFromConfig({
        store,
        projectConfig: context.projectConfig,
        projectId: otherProjectId,
        environmentId: CLONED_ENV_ID,
      });
      expect(result).toEqual({ adoptedProject: false, adoptedEnvironment: false });
      expect(await store.projects.getProject(otherProjectId)).toBeNull();
    } finally {
      store.close();
    }
  });

  it("reports the per-machine value summary on init re-run without minting new ids", async () => {
    const context = await setupClonedProject();
    const { api, dispose } = createLocalApi(context);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const exitCode = await runInitCommand({ ...baseFlags, configDir: projectDir }, api, context, {
        profileSlug: "local-dev",
        provision: {
          keyStore: createFakeKeyStore({ keyHex: KEY_HEX }),
          configHome: isolatedHome.homeDir,
        },
      });
      expect(exitCode).toBe(0);
      const envelope = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        ok: boolean;
        data: {
          projectId: string;
          environmentId: string;
          adopted: boolean;
          summary: string;
          machineScope: string;
          missingValues: { variableKey: string; secretsSet: string[] }[];
        };
        next: { id: string; argv: string[] }[];
      };
      expect(envelope.ok).toBe(true);
      expect(envelope.data.projectId).toBe(CLONED_PROJECT_ID);
      expect(envelope.data.environmentId).toBe(CLONED_ENV_ID);
      expect(envelope.data.adopted).toBe(true);
      expect(envelope.data.summary).toBe("0 of 3 manifest keys have values on this machine.");
      expect(envelope.data.machineScope).toBe(LOCAL_MODE_MACHINE_SCOPED_LINE);
      expect(envelope.data.missingValues).toHaveLength(3);
      expect(envelope.next).toHaveLength(3);
      expect(JSON.stringify(envelope)).not.toMatch(/valueUtf8|plaintext|ciphertext/i);

      const reloaded = await loadAndResolveCliContext({ ...baseFlags, configDir: projectDir });
      expect(reloaded.projectConfig?.projectId).toBe(CLONED_PROJECT_ID);

      stdout.mockClear();
      const secondExit = await runInitCommand(
        { ...baseFlags, configDir: projectDir },
        api,
        context,
        {
          profileSlug: "local-dev",
          provision: {
            keyStore: createFakeKeyStore({ keyHex: KEY_HEX }),
            configHome: isolatedHome.homeDir,
          },
        },
      );
      expect(secondExit).toBe(0);
      const secondEnvelope = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
        data: { adopted: boolean };
      };
      expect(secondEnvelope.data.adopted).toBe(false);
    } finally {
      stdout.mockRestore();
      dispose();
    }
  });

  it("builds --generate argv only for shapes with a generation hint", () => {
    const key = "SOME_KEY" as VariableKey;
    expect(secretsSetArgv(key, null)).toEqual(["insecur", "secrets", "set", "SOME_KEY"]);
    expect(secretsSetArgv(key, "random")).toEqual([
      "insecur",
      "secrets",
      "set",
      "SOME_KEY",
      "--generate",
      "random",
    ]);
    expect(secretsSetArgv(key, "random:48")).toEqual([
      "insecur",
      "secrets",
      "set",
      "SOME_KEY",
      "--generate",
      "random",
      "--length",
      "48",
    ]);
    expect(secretsSetArgv(key, "uuid")).toEqual(["insecur", "secrets", "set", "SOME_KEY"]);
  });
});
