import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  environmentId,
  errorEnvelope,
  injectionGrantId,
  organizationId,
  projectId,
  secretId as secretIdBrand,
  secretVersionId,
  successEnvelope,
  bytesToBase64Url,
  type DisplayName,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import { createFakeKeyStore } from "@insecur/local-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import { createLocalApiClient } from "../src/api/local-client.js";
import { loadAndResolveCliContext } from "../src/config/load-cli-context.js";
import { PROJECT_CONFIG_FILE } from "../src/config/paths.js";
import { runProjectsMigrateCommand } from "../src/commands/projects-migrate.js";
import type { MigrateCloudApi } from "../src/commands/projects-migrate-reconcile.js";
import { runRunCommand } from "../src/commands/run.js";
import { runSecretsSetCommand } from "../src/commands/secrets-set.js";
import { openLocalStore } from "../src/local/open-local-store.js";
import { CliError } from "../src/output/cli-error.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const HOST = "https://cloud.test";
const ORG_ID = organizationId.brand("org_01TESTMIGRATE0000000000001");
const OTHER_ORG_ID = organizationId.brand("org_01TESTMIGRATE0000000000002");
const LOCAL_PROJECT_ID = projectId.brand("prj_01TESTMIGRATE0000000000001");
const LOCAL_ENV_ID = environmentId.brand("env_01TESTMIGRATE0000000000001");
const LOCAL_PROFILE_ID = "prof_01TESTMIGRATE0000000000001";
const KEY_HEX = "e".repeat(64);
const REMOTE_DIVERGENT_VALUE = "remote-divergent-sensitive-value";

const COMMITTED_CONFIG = {
  host: "local",
  projectId: LOCAL_PROJECT_ID,
  defaultEnvId: LOCAL_ENV_ID,
  profileId: LOCAL_PROFILE_ID,
  secretShapes: [
    { variableKey: "DATABASE_URL", displayName: "Database URL", required: true },
    { variableKey: "INSECUR_PROOF_SECRET", generationHint: "random:32" },
    { variableKey: "SERVICE_TOKEN" },
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
  agent: undefined,
  json: true,
  quiet: true,
  verbose: false,
  color: undefined,
  full: false,
};

interface FakeRemoteSecret {
  secretId: SecretId;
  value: string | null;
}

const DUMMY_VERDICTS = {
  valueByteLength: 8,
  encodingClass: "utf-8",
  isEmpty: false,
  hasLeadingOrTrailingWhitespace: false,
  looksLikePlaceholder: false,
  secretShapeMatchVerdict: "no_shape_rule",
} as const;

function ok<T>(data: T) {
  return { ok: true as const, envelope: successEnvelope(data) };
}

function fail(code: string, httpStatus: number) {
  return {
    ok: false as const,
    envelope: errorEnvelope({ code, message: `fake cloud failure: ${code}`, retryable: false }),
    httpStatus,
  };
}

/**
 * In-memory hosted instance: one organization set, one project/environment namespace, byte-equal
 * possession verdicts. Tracks every mutating call so tests can prove the divergence path writes
 * nothing.
 */
function createFakeCloud(options: { readonly organizations?: number } = {}) {
  const organizations = [
    { organizationId: ORG_ID, displayName: "Personal" as DisplayName },
    ...(options.organizations === 2
      ? [{ organizationId: OTHER_ORG_ID, displayName: "Second" as DisplayName }]
      : []),
  ];
  const state = {
    projects: new Map<string, string>(),
    environments: new Map<string, { projectId: string; isProtected: boolean }>(),
    secrets: new Map<string, FakeRemoteSecret>(),
    mutations: [] as string[],
    failWritesAfter: Number.POSITIVE_INFINITY,
    writesThisRun: 0,
  };

  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

  const api: MigrateCloudApi &
    Pick<
      ApiClient,
      "issueInjectionGrant" | "consumeInjectionGrant" | "recordInjectionRunCompleted"
    > = {
    listSessionOrganizations: () => Promise.resolve(ok({ organizations })),
    listProjects: () =>
      Promise.resolve(
        ok({
          projects: [...state.projects.entries()].map(([id, displayName]) => ({
            projectId: projectId.brand(id),
            organizationId: ORG_ID,
            displayName: displayName as DisplayName,
            createdAt: "2026-07-16T00:00:00.000Z",
          })),
        }),
      ),
    createProject: (input) => {
      state.mutations.push(`createProject:${input.projectId}`);
      state.projects.set(input.projectId, input.displayName);
      return Promise.resolve(
        ok({
          projectId: input.projectId,
          organizationId: ORG_ID,
          displayName: input.displayName,
          createdAt: "2026-07-16T00:00:00.000Z",
        }),
      );
    },
    listEnvironments: (input) =>
      Promise.resolve(
        ok({
          environments: [...state.environments.entries()]
            .filter(([, environment]) => environment.projectId === input.projectId)
            .map(([id, environment]) => ({
              environmentId: environmentId.brand(id),
              organizationId: ORG_ID,
              projectId: projectId.brand(environment.projectId),
              displayName: "Development" as DisplayName,
              lifecycleStage: "development",
              isProtected: environment.isProtected,
              createdAt: "2026-07-16T00:00:00.000Z",
            })),
        }),
      ),
    createEnvironment: (input) => {
      state.mutations.push(`createEnvironment:${input.environmentId}`);
      state.environments.set(input.environmentId, {
        projectId: input.projectId,
        isProtected: false,
      });
      return Promise.resolve(
        ok({
          environmentId: input.environmentId,
          organizationId: ORG_ID,
          projectId: input.projectId,
          displayName: input.displayName,
          lifecycleStage: "development",
          isProtected: false,
          createdAt: "2026-07-16T00:00:00.000Z",
          copiedShapeCount: 0,
        }),
      );
    },
    listEnvironmentSecrets: () =>
      Promise.resolve(
        ok({
          secrets: [...state.secrets.entries()].map(([variableKey, secret]) => ({
            secretId: secret.secretId,
            variableKey: variableKey as VariableKey,
            displayName: variableKey,
            createdAt: "2026-07-16T00:00:00.000Z",
            ...(secret.value === null
              ? {}
              : {
                  currentVersion: {
                    secretVersionId: secretVersionId.brand("sv_01TESTMIGRATE0000000000001"),
                    versionNumber: 1,
                    lifecycleState: "live" as const,
                    createdAt: "2026-07-16T00:00:00.000Z",
                    descriptiveVerdicts: DUMMY_VERDICTS,
                  },
                }),
          })),
        }),
      ),
    writeSecretByVariableKey: (input) => {
      state.writesThisRun += 1;
      if (state.writesThisRun > state.failWritesAfter) {
        return Promise.resolve(fail("store.unavailable", 503));
      }
      const existing = state.secrets.get(input.variableKey);
      if (input.createOnly === true && existing !== undefined) {
        return Promise.resolve(fail("import.existing_secret", 409));
      }
      if (!("valueUtf8" in input) || input.valueUtf8 === undefined) {
        return Promise.resolve(fail("secret.invalid_input_mode", 400));
      }
      const secretId = input.secretId ?? existing?.secretId ?? secretIdBrand.generate();
      state.mutations.push(`writeSecret:${input.variableKey}`);
      state.secrets.set(input.variableKey, { secretId, value: decode(input.valueUtf8) });
      return Promise.resolve(
        ok({
          secretId,
          secretVersionId: secretVersionId.brand("sv_01TESTMIGRATE0000000000002"),
          variableKey: input.variableKey,
          createdSecretShape: existing === undefined,
          descriptiveVerdicts: DUMMY_VERDICTS,
        }),
      );
    },
    checkSecretPossession: (input) => {
      const secret = state.secrets.get(input.variableKey);
      if (secret === undefined || secret.value === null) {
        return Promise.resolve(fail("secret.coordinate_invalid", 404));
      }
      return Promise.resolve(
        ok({
          secretId: secret.secretId,
          variableKey: input.variableKey,
          verdict:
            decode(input.candidateUtf8) === secret.value
              ? ("match" as const)
              : ("mismatch" as const),
          auditEventId: "ae_fake_possession",
        }),
      );
    },
    issueInjectionGrant: (input) => {
      if (!("variableKey" in input) || input.variableKey === undefined) {
        return Promise.resolve(fail("injection.grant_denied", 404));
      }
      return Promise.resolve(
        ok({
          grantId: injectionGrantId.brand("igr_01TESTMIGRATE0000000000001"),
          expiresAt: "2026-07-16T01:00:00.000Z",
        }),
      );
    },
    consumeInjectionGrant: (input) => {
      const secret = state.secrets.get(input.variableKey);
      if (secret === undefined || secret.value === null) {
        return Promise.resolve(fail("injection.grant_denied", 404));
      }
      return Promise.resolve({
        ok: true as const,
        envelope: {
          ok: true as const,
          delivery: {
            secretId: secret.secretId,
            secretVersionId: secretVersionId.brand("sv_01TESTMIGRATE0000000000001"),
            variableKey: input.variableKey,
            grantId: input.grantId,
            encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode(secret.value)),
          },
        },
      });
    },
    recordInjectionRunCompleted: () =>
      Promise.resolve(ok({ auditEventId: "ae_fake_run", alreadyRecorded: false })),
  };
  return { api, state };
}

type FakeCloud = ReturnType<typeof createFakeCloud>;

function createMockChild(exitCode: number) {
  const child = new EventEmitter();
  queueMicrotask(() => {
    child.emit("close", exitCode, null);
  });
  return child;
}

describe("insecur projects migrate", () => {
  let projectDir: string;
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    spawnMock.mockReset();
    stdoutSpy?.mockRestore();
    delete process.env.INSECUR_SESSION_TOKEN;
    isolatedHome?.restore();
  });

  async function setupLocalProject() {
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-migrate-"));
    isolatedHome = await createIsolatedHome("insecur-cli-migrate-home-");
    process.env.INSECUR_SESSION_TOKEN = "test-session-credential";
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await writeFile(
      path.join(projectDir, PROJECT_CONFIG_FILE),
      JSON.stringify(COMMITTED_CONFIG, null, 2),
      "utf8",
    );
    return loadContext();
  }

  function loadContext() {
    return loadAndResolveCliContext({ ...baseFlags, configDir: projectDir });
  }

  function openStore() {
    return openLocalStore({
      configHome: isolatedHome.homeDir,
      keyStore: createFakeKeyStore({ keyHex: KEY_HEX }),
    });
  }

  async function setAllManifestKeys(context: Awaited<ReturnType<typeof loadContext>>) {
    for (const variableKey of MANIFEST_KEYS) {
      const store = openStore();
      try {
        const api = createLocalApiClient({
          store,
          context,
          flags: { ...baseFlags, configDir: projectDir },
        });
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
        store.close();
      }
    }
  }

  async function runMigrate(
    fake: FakeCloud,
    overrides: Partial<Parameters<typeof runProjectsMigrateCommand>[2]> = {},
  ) {
    fake.state.writesThisRun = 0;
    const context = await loadContext();
    return runProjectsMigrateCommand(
      { ...baseFlags, configDir: projectDir, host: HOST },
      context,
      {
        orgId: undefined,
        confirmMigrate: true,
        yes: false,
        skipKeys: [],
        ...overrides,
      },
      {
        openStore,
        createCloudApi: () => fake.api,
        confirm: () => Promise.resolve(false),
      },
    );
  }

  function lastStdoutJson(): Record<string, unknown> {
    const calls = stdoutSpy.mock.calls;
    const last = calls[calls.length - 1]?.[0];
    return JSON.parse(String(last)) as Record<string, unknown>;
  }

  async function readCommittedConfig(): Promise<Record<string, unknown>> {
    const raw = await readFile(path.join(projectDir, PROJECT_CONFIG_FILE), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  async function localShapeSecretIds(): Promise<ReadonlyMap<string, SecretId>> {
    const store = openStore();
    try {
      const shapes = await store.projects.listSecretShapes(LOCAL_PROJECT_ID);
      return new Map(shapes.map((shape) => [shape.variableKey as string, shape.secretId]));
    } finally {
      store.close();
    }
  }

  async function expectLocalStateIntact() {
    const store = openStore();
    try {
      expect(await store.projects.getProject(LOCAL_PROJECT_ID)).not.toBeNull();
      const metadata = await store.secretVersions.listSecretMetadata(
        LOCAL_PROJECT_ID,
        LOCAL_ENV_ID,
      );
      expect(metadata.filter((row) => row.hasCurrentVersion)).toHaveLength(MANIFEST_KEYS.length);
    } finally {
      store.close();
    }
    const config = await readCommittedConfig();
    expect(config.host).toBe("local");
  }

  it("migrates a 3-secret local project into a fresh org with id replay, then cleans and flips", async () => {
    const context = await setupLocalProject();
    await setAllManifestKeys(context);
    const localIds = await localShapeSecretIds();
    const fake = createFakeCloud();

    await expect(runMigrate(fake)).resolves.toBe(0);

    // Remote resources exist under the client-minted local ids.
    expect([...fake.state.projects.keys()]).toEqual([LOCAL_PROJECT_ID]);
    expect([...fake.state.environments.keys()]).toEqual([LOCAL_ENV_ID]);
    expect([...fake.state.secrets.keys()].sort()).toEqual([...MANIFEST_KEYS].sort());
    for (const [variableKey, secret] of fake.state.secrets) {
      expect(secret.secretId).toBe(localIds.get(variableKey));
      expect(secret.value).not.toBeNull();
    }

    // Verified-then-clean: the local store no longer contains the project.
    const store = openStore();
    try {
      expect(await store.projects.getProject(LOCAL_PROJECT_ID)).toBeNull();
      expect(await store.projects.listSecretShapes(LOCAL_PROJECT_ID)).toHaveLength(0);
    } finally {
      store.close();
    }

    // Config flips last: cloud host + orgId, committed shape manifest dropped (server owns shapes).
    const config = await readCommittedConfig();
    expect(config.host).toBe(HOST);
    expect(config.orgId).toBe(ORG_ID);
    expect(config.projectId).toBe(LOCAL_PROJECT_ID);
    expect(config.secretShapes).toBeUndefined();

    // The success envelope carries the removal manifest, metadata only.
    const output = lastStdoutJson();
    expect(output).toMatchObject({
      ok: true,
      data: {
        status: "migrated",
        createdProject: true,
        createdEnvironment: true,
        removedLocal: { valueCount: 3 },
      },
    });

    // `run` against the now-cloud project succeeds through the hosted grant surface.
    spawnMock.mockImplementation(() => createMockChild(0));
    const cloudContext = await loadContext();
    expect(cloudContext.scope.host).toBe(HOST);
    const runExit = await runRunCommand(
      { ...baseFlags, configDir: projectDir },
      fake.api as unknown as ApiClient,
      cloudContext,
      { variableKey: "INSECUR_PROOF_SECRET", command: ["node", "-e", "process.exit(0)"] },
    );
    expect(runExit).toBe(0);

    // Idempotent re-run: already hosted, reports already in sync, mutates nothing.
    const mutationsBefore = fake.state.mutations.length;
    await expect(runMigrate(fake)).resolves.toBe(0);
    expect(lastStdoutJson()).toMatchObject({ ok: true, data: { status: "already_in_sync" } });
    expect(fake.state.mutations).toHaveLength(mutationsBefore);
  });

  it("fails loud on divergence with nothing written, then converges with --skip-key", async () => {
    const context = await setupLocalProject();
    await setAllManifestKeys(context);
    const fake = createFakeCloud();
    // Pre-create the remote project/environment and one diverging key.
    fake.state.projects.set(LOCAL_PROJECT_ID, "First project");
    fake.state.environments.set(LOCAL_ENV_ID, { projectId: LOCAL_PROJECT_ID, isProtected: false });
    fake.state.secrets.set("DATABASE_URL", {
      secretId: secretIdBrand.generate(),
      value: REMOTE_DIVERGENT_VALUE,
    });

    let thrown: unknown;
    try {
      await runMigrate(fake);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CliError);
    const cliError = thrown as CliError;
    expect(cliError.code).toBe("migrate.remote_diverged");
    expect(cliError.exitCode).toBe(6);
    expect(cliError.data).toEqual({
      divergedKeys: [{ variableKey: "DATABASE_URL", code: "secret.possession_mismatch" }],
    });
    // Remediation lists the exact resolution argv arrays.
    expect(cliError.remediation?.usage).toEqual([
      "insecur",
      "projects",
      "migrate",
      "--org-id",
      ORG_ID,
      "--confirm-migrate",
      "--skip-key",
      "DATABASE_URL",
    ]);
    expect(cliError.remediation?.secretsSet).toEqual([
      "insecur",
      "secrets",
      "set",
      "<variable-key>",
      "--value-stdin",
      "--host",
      HOST,
      "--org-id",
      ORG_ID,
      "--project-id",
      LOCAL_PROJECT_ID,
      "--env-id",
      LOCAL_ENV_ID,
    ]);
    // No Sensitive Values anywhere in the failure surface.
    const failureSurface = JSON.stringify({
      message: cliError.message,
      data: cliError.data,
      remediation: cliError.remediation,
    });
    expect(failureSurface).not.toContain(REMOTE_DIVERGENT_VALUE);

    // Nothing written remotely, nothing deleted locally; the command is re-runnable.
    expect(fake.state.mutations).toHaveLength(0);
    await expectLocalStateIntact();

    // Explicitly skipping the diverged key keeps the remote value and completes the migration.
    await expect(runMigrate(fake, { skipKeys: ["DATABASE_URL"] })).resolves.toBe(0);
    expect(fake.state.secrets.get("DATABASE_URL")?.value).toBe(REMOTE_DIVERGENT_VALUE);
    expect([...fake.state.secrets.keys()].sort()).toEqual([...MANIFEST_KEYS].sort());
    const output = lastStdoutJson();
    expect(output).toMatchObject({ ok: true, data: { skippedKeys: ["DATABASE_URL"] } });
    const config = await readCommittedConfig();
    expect(config.host).toBe(HOST);
  });

  it("leaves local state intact on a mid-migrate crash and converges on re-run via id replay", async () => {
    const context = await setupLocalProject();
    await setAllManifestKeys(context);
    const fake = createFakeCloud();
    // First write succeeds, the second "crashes" — a kill-mid-migrate equivalent.
    fake.state.failWritesAfter = 1;

    await expect(runMigrate(fake)).rejects.toBeInstanceOf(CliError);
    expect(fake.state.secrets.size).toBe(1);
    await expectLocalStateIntact();

    // Heal the fake and re-run: possession match skips the written key, the rest converge.
    fake.state.failWritesAfter = Number.POSITIVE_INFINITY;
    await expect(runMigrate(fake)).resolves.toBe(0);
    expect([...fake.state.secrets.keys()].sort()).toEqual([...MANIFEST_KEYS].sort());
    const rewrites = fake.state.mutations.filter((entry) => entry.startsWith("writeSecret:"));
    // The key written before the crash is never rewritten.
    expect(rewrites).toHaveLength(MANIFEST_KEYS.length);
    const config = await readCommittedConfig();
    expect(config.host).toBe(HOST);
  });

  it("rejects generic --yes and unconfirmed runs without touching either side", async () => {
    const context = await setupLocalProject();
    await setAllManifestKeys(context);
    const fake = createFakeCloud();

    for (const overrides of [
      { confirmMigrate: false, yes: true },
      { confirmMigrate: false, yes: false },
    ]) {
      let thrown: unknown;
      try {
        await runMigrate(fake, overrides);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CliError);
      const cliError = thrown as CliError;
      expect(cliError.code).toBe("cli.validation_error");
      expect(cliError.remediation?.usage).toContain("--confirm-migrate");
    }
    const yesError = await runMigrate(fake, { confirmMigrate: false, yes: true }).catch(
      (error: unknown) => error,
    );
    expect((yesError as CliError).message).toContain("--yes cannot confirm");
    expect(fake.state.mutations).toHaveLength(0);
    await expectLocalStateIntact();
  });

  it("requires --org-id when the session belongs to multiple organizations", async () => {
    await setupLocalProject();
    const fake = createFakeCloud({ organizations: 2 });

    const thrown = await runMigrate(fake).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).code).toBe("validation.invalid_command_input");
    expect((thrown as CliError).message).toContain("--org-id");
  });

  it("has no cloud-to-local direction", async () => {
    const context = await setupLocalProject();
    await setAllManifestKeys(context);
    const fake = createFakeCloud();

    const thrown = await runProjectsMigrateCommand(
      { ...baseFlags, configDir: projectDir, host: "local" },
      context,
      { orgId: undefined, confirmMigrate: true, yes: false, skipKeys: [] },
      { openStore, createCloudApi: () => fake.api, confirm: () => Promise.resolve(false) },
    ).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).message).toContain("one-way");
    await expectLocalStateIntact();
  });
});
