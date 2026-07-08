import { createKeyring } from "@insecur/crypto";
import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applySecretSyncTargetPatch } from "../src/apply-secret-sync-target-patch.js";
import { disableSecretSyncInStore } from "../src/disable-secret-sync-in-store.js";
import { listMetadataSafeSecretSyncs } from "../src/list-metadata-safe-secret-syncs.js";
import { persistNewSecretSync } from "../src/persist-new-secret-sync.js";
import { persistSecretSyncUpdate } from "../src/persist-secret-sync-update.js";
import { replaceSecretSyncBindings } from "../src/replace-secret-sync-bindings.js";
import { SecretSyncError } from "../src/secret-sync-error.js";
import {
  CONN,
  ENV,
  ORG,
  PROJECT,
  SECRET,
  SYNC,
  USER,
  createActiveGitHubSync,
  createBindingRow,
  createGitHubConnection,
  displayName,
} from "./helpers/secret-sync-test-fixtures.js";

const KEYRING = createKeyring(new Uint8Array(32).fill(3));

const {
  createSecretSync,
  updateSecretSync,
  replaceBindings,
  listBindings,
  listBindingsForSyncs,
  listSecretSyncs,
  getSecretSyncById,
  getConnectionById,
  upsertField,
  getField,
} = vi.hoisted(() => ({
  createSecretSync: vi.fn(),
  updateSecretSync: vi.fn(),
  replaceBindings: vi.fn(),
  listBindings: vi.fn(),
  listBindingsForSyncs: vi.fn(),
  listSecretSyncs: vi.fn(),
  getSecretSyncById: vi.fn(),
  getConnectionById: vi.fn(),
  upsertField: vi.fn(async () => undefined),
  getField: vi.fn(async () => ({ wrapped: {} })),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    TenantSecretSyncStore: class {
      createSecretSync = createSecretSync;
      updateSecretSync = updateSecretSync;
      replaceBindings = replaceBindings;
      listBindings = listBindings;
      listBindingsForSyncs = listBindingsForSyncs;
      listSecretSyncs = listSecretSyncs;
      getSecretSyncById = getSecretSyncById;
    },
    TenantAppConnectionStore: class {
      getConnectionById = getConnectionById;
    },
    TenantSensitiveMetadataStore: class {
      upsertField = upsertField;
      getField = getField;
    },
  };
});

vi.mock("../src/assert-secret-sync-bindings.js", () => ({
  assertSecretSyncBindings: vi.fn(async () => undefined),
}));

const activeSync = createActiveGitHubSync();
const bindingRow = createBindingRow();

describe("secret sync persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnectionById.mockResolvedValue(createGitHubConnection());
    createSecretSync.mockResolvedValue(activeSync);
    updateSecretSync.mockResolvedValue(activeSync);
    replaceBindings.mockResolvedValue([bindingRow]);
    listBindings.mockResolvedValue([bindingRow]);
    listBindingsForSyncs.mockResolvedValue([bindingRow]);
    listSecretSyncs.mockResolvedValue([activeSync]);
    getField.mockResolvedValue({ wrapped: {} });
  });

  it("persists a new secret sync with bindings and metadata-safe view", async () => {
    const result = await persistNewSecretSync({
      db: {} as never,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      appConnectionId: CONN,
      secretSyncId: SYNC,
      displayName: displayName("prod"),
      kind: "github-actions",
      validatedBindings: [{ secretId: SECRET, providerDestination: "DATABASE_URL" }],
      validatedTarget: {
        githubProviderScope: "repository",
        targetRepoId: "repo_00000000000000000000000001",
        targetGithubEnvironmentId: null,
        workerScriptName: null,
      },
      keyring: KEYRING,
    });

    expect(createSecretSync).toHaveBeenCalled();
    expect(replaceBindings).toHaveBeenCalled();
    expect(result.secretSync.id).toBe(SYNC);
    expect(result.secretSync.bindings[0]?.hasProviderDestination).toBe(true);
  });

  it("rejects create when the app connection is missing", async () => {
    getConnectionById.mockResolvedValue(null);

    await expect(
      persistNewSecretSync({
        db: {} as never,
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        appConnectionId: CONN,
        secretSyncId: SYNC,
        displayName: displayName("prod"),
        kind: "github-actions",
        validatedBindings: [{ secretId: SECRET, providerDestination: "DATABASE_URL" }],
        validatedTarget: {
          githubProviderScope: "repository",
          targetRepoId: "repo_00000000000000000000000001",
          targetGithubEnvironmentId: null,
          workerScriptName: null,
        },
        keyring: KEYRING,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.connectionNotEligible });
  });

  it("replaces bindings and updates sync metadata", async () => {
    const replaced = await replaceSecretSyncBindings({
      db: {} as never,
      organizationId: ORG,
      projectId: PROJECT,
      secretSyncId: SYNC,
      validatedBindings: [{ secretId: SECRET, providerDestination: "API_KEY" }],
      keyring: KEYRING,
    });

    expect(replaceBindings).toHaveBeenCalled();
    expect(upsertField).toHaveBeenCalled();
    expect(replaced).toEqual([bindingRow]);
  });

  it("updates an existing sync without replacing bindings", async () => {
    const renamed = displayName("renamed");
    updateSecretSync.mockResolvedValue(createActiveGitHubSync({ displayName: renamed }));

    const result = await persistSecretSyncUpdate({
      db: {} as never,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      existing: activeSync,
      displayName: renamed,
      keyring: KEYRING,
    });

    expect(updateSecretSync).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: renamed }),
    );
    expect(result.secretSync.displayName).toBe("renamed");
  });

  it("applies github target patches during update", async () => {
    const patch = await applySecretSyncTargetPatch({
      db: {} as never,
      organizationId: ORG,
      projectId: PROJECT,
      existing: activeSync,
      githubTarget: {
        targetRepoId: "repo_00000000000000000000000002",
        githubProviderScope: "repository",
      },
      keyring: KEYRING,
    });

    expect(patch.targetRepoId).toBe("repo_00000000000000000000000002");
  });

  it("disables an active sync", async () => {
    const disabledSync = createActiveGitHubSync({ status: "disabled", disabledAt: new Date() });
    updateSecretSync.mockResolvedValue(disabledSync);

    const result = await disableSecretSyncInStore({
      db: {} as never,
      organizationId: ORG,
      existing: activeSync,
    });

    expect(result.secretSync.status).toBe("disabled");
  });

  it("rejects disabling an already disabled sync", async () => {
    await expect(
      disableSecretSyncInStore({
        db: {} as never,
        organizationId: ORG,
        existing: createActiveGitHubSync({ status: "disabled", disabledAt: new Date() }),
      }),
    ).rejects.toBeInstanceOf(SecretSyncError);
  });

  it("lists metadata-safe secret syncs for a project", async () => {
    const result = await listMetadataSafeSecretSyncs({
      db: {} as never,
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.bindings[0]?.hasProviderDestination).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/DATABASE_URL|API_KEY/);
  });
});
