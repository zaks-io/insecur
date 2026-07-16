import {
  PROTECTED_CHANGE_ERROR_CODES,
  appConnectionId,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  secretSyncId,
  userId,
} from "@insecur/domain";
import { createKeyring } from "@insecur/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/assert-secret-sync-delivery-approval.js", () => ({
  assertProtectedSecretSyncActionApproved: vi.fn(async () => undefined),
}));

vi.mock("../src/assert-secret-sync-access.js", () => ({
  resolveSecretSyncManageAccess: vi.fn(async () => undefined),
  resolveSecretSyncProjectReadAccess: vi.fn(async () => undefined),
}));

vi.mock("../src/assert-secret-sync-bindings.js", () => ({
  assertSecretSyncBindings: vi.fn(async () => undefined),
}));

vi.mock("../src/persist-new-secret-sync.js", () => ({
  persistNewSecretSync: vi.fn(),
}));

vi.mock("../src/persist-secret-sync-update.js", () => ({
  persistSecretSyncUpdate: vi.fn(),
}));

vi.mock("../src/disable-secret-sync-in-store.js", () => ({
  disableSecretSyncInStore: vi.fn(),
}));

vi.mock("../src/list-metadata-safe-secret-syncs.js", () => ({
  listMetadataSafeSecretSyncs: vi.fn(),
}));

vi.mock("../src/record-secret-sync-audit.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/record-secret-sync-audit.js")>();
  return {
    ...actual,
    recordSecretSyncCreated: vi.fn(async () => ({ auditEventId: "aud_01" })),
    recordSecretSyncCreateDenied: vi.fn(async () => ({ auditEventId: "aud_02" })),
    recordSecretSyncUpdated: vi.fn(async () => ({ auditEventId: "aud_03" })),
    recordSecretSyncUpdateDenied: vi.fn(async () => ({ auditEventId: "aud_04" })),
    recordSecretSyncDisabled: vi.fn(async () => ({ auditEventId: "aud_05" })),
    recordSecretSyncDisableDenied: vi.fn(async () => ({ auditEventId: "aud_06" })),
  };
});

vi.mock("../src/secret-sync-command-shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/secret-sync-command-shared.js")>();
  return {
    ...actual,
    runScopedSecretSyncMutation: vi.fn(),
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, run) => run({ db: {} as never })),
  };
});

import { createSecretSyncCommand } from "../src/create-secret-sync-command.js";
import { disableSecretSyncCommand } from "../src/disable-secret-sync-command.js";
import { listSecretSyncsCommand } from "../src/list-secret-syncs-command.js";
import { updateSecretSyncCommand } from "../src/update-secret-sync-command.js";
import { persistNewSecretSync } from "../src/persist-new-secret-sync.js";
import { persistSecretSyncUpdate } from "../src/persist-secret-sync-update.js";
import { disableSecretSyncInStore } from "../src/disable-secret-sync-in-store.js";
import { listMetadataSafeSecretSyncs } from "../src/list-metadata-safe-secret-syncs.js";
import { runScopedSecretSyncMutation } from "../src/secret-sync-command-shared.js";
import { resolveSecretSyncManageAccess } from "../src/assert-secret-sync-access.js";
import { assertProtectedSecretSyncActionApproved } from "../src/assert-secret-sync-delivery-approval.js";
import {
  recordSecretSyncCreateDenied,
  recordSecretSyncUpdateDenied,
} from "../src/record-secret-sync-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const CONN = appConnectionId.brand("conn_00000000000000000000000001");
const SYNC = secretSyncId.brand("sync_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const KEYRING = createKeyring(new Uint8Array(32).fill(4));

function displayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) throw new Error(parsed.code);
  return parsed.value;
}

const metadataSafeSync = {
  id: SYNC,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  appConnectionId: CONN,
  displayName: displayName("prod"),
  kind: "github-actions" as const,
  mappingBehavior: "managed" as const,
  autoSyncEnabled: false,
  status: "active" as const,
  githubProviderScope: "repository" as const,
  targetRepoId: "repo_00000000000000000000000001",
  targetGithubEnvironmentId: null,
  hasWorkerScriptTarget: false,
  bindings: [],
  disabledAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function createCommandInput() {
  return {
    actor: ACTOR,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    appConnectionId: CONN,
    displayName: displayName("prod"),
    kind: "github-actions",
    bindings: [
      {
        secretId: "sec_00000000000000000000000001",
        providerDestination: "DATABASE_URL",
      },
    ],
    githubTarget: {
      targetRepoId: "repo_00000000000000000000000001",
      githubProviderScope: "repository" as const,
    },
    requestId: requestId.generate(),
    keyring: KEYRING,
    secretSyncId: SYNC,
  };
}

const APPROVAL_DENIAL = Object.assign(new Error("missing approval evidence"), {
  code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
});

describe("secret sync commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertProtectedSecretSyncActionApproved).mockResolvedValue(undefined);
  });

  it("creates a secret sync and records audit success", async () => {
    vi.mocked(persistNewSecretSync).mockResolvedValue({
      sync: { id: SYNC } as never,
      persistedBindings: [],
      secretSync: metadataSafeSync,
    });

    const result = await createSecretSyncCommand(createCommandInput());

    expect(resolveSecretSyncManageAccess).toHaveBeenCalled();
    expect(assertProtectedSecretSyncActionApproved).toHaveBeenCalledWith(
      "secret_sync_enable",
      expect.objectContaining({ organizationId: ORG, environmentId: ENV }),
      SYNC,
    );
    expect(result.auditEventId).toBe("aud_01");
    expect(result.secretSync.id).toBe(SYNC);
  });

  it("fails closed on create when the protected delivery approval gate denies", async () => {
    vi.mocked(assertProtectedSecretSyncActionApproved).mockRejectedValue(APPROVAL_DENIAL);

    await expect(createSecretSyncCommand(createCommandInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });

    expect(persistNewSecretSync).not.toHaveBeenCalled();
    expect(recordSecretSyncCreateDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: PROTECTED_CHANGE_ERROR_CODES.missingEvidence }),
    );
  });

  it("updates a secret sync through the scoped mutation helper", async () => {
    vi.mocked(runScopedSecretSyncMutation).mockImplementation(async ({ run }) =>
      run({ db: {} as never, syncStore: {} as never, existing: { id: SYNC } as never }),
    );
    vi.mocked(persistSecretSyncUpdate).mockResolvedValue({
      sync: { id: SYNC } as never,
      persistedBindings: [],
      secretSync: metadataSafeSync,
    });

    const result = await updateSecretSyncCommand({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretSyncId: SYNC,
      displayName: displayName("renamed"),
      requestId: requestId.generate(),
      keyring: KEYRING,
    });

    expect(result.auditEventId).toBe("aud_03");
    expect(assertProtectedSecretSyncActionApproved).toHaveBeenCalledWith(
      "secret_sync_enable",
      expect.objectContaining({ organizationId: ORG, environmentId: ENV, secretSyncId: SYNC }),
      SYNC,
    );
  });

  it("fails closed on update when the protected delivery approval gate denies", async () => {
    vi.mocked(assertProtectedSecretSyncActionApproved).mockRejectedValue(APPROVAL_DENIAL);

    await expect(
      updateSecretSyncCommand({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretSyncId: SYNC,
        displayName: displayName("renamed"),
        requestId: requestId.generate(),
        keyring: KEYRING,
      }),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence });

    expect(runScopedSecretSyncMutation).not.toHaveBeenCalled();
    expect(persistSecretSyncUpdate).not.toHaveBeenCalled();
    expect(recordSecretSyncUpdateDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: PROTECTED_CHANGE_ERROR_CODES.missingEvidence }),
    );
  });

  it("disables a secret sync", async () => {
    vi.mocked(runScopedSecretSyncMutation).mockImplementation(async ({ run }) =>
      run({ db: {} as never, syncStore: {} as never, existing: { id: SYNC } as never }),
    );
    vi.mocked(disableSecretSyncInStore).mockResolvedValue({
      sync: { id: SYNC } as never,
      secretSync: { ...metadataSafeSync, status: "disabled" },
    });

    const result = await disableSecretSyncCommand({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretSyncId: SYNC,
      requestId: requestId.generate(),
    });

    expect(result.secretSync.status).toBe("disabled");
  });

  it("lists metadata-safe secret syncs for a project", async () => {
    vi.mocked(listMetadataSafeSecretSyncs).mockResolvedValue([metadataSafeSync]);

    const result = await listSecretSyncsCommand({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(result.secretSyncs).toHaveLength(1);
  });
});
