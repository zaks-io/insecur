import {
  appConnectionId,
  organizationId,
  parseDisplayName,
  secretSyncId,
  SECRET_SYNC_ERROR_CODES,
  type DisplayName,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { assertSecretSyncExecutable } from "../src/assert-secret-sync-executable.js";
import { SecretSyncError } from "../src/secret-sync-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const SYNC = secretSyncId.brand("sync_00000000000000000000000001");
const CONN = appConnectionId.brand("conn_01JZ8GH12R7M4T0V9X3C5D8F1G");

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

const disabledSync = {
  id: SYNC,
  organizationId: ORG,
  projectId: "prj_00000000000000000000000001",
  environmentId: "env_00000000000000000000000001",
  appConnectionId: CONN,
  displayName: displayName("preview sync"),
  kind: "github-actions" as const,
  mappingBehavior: "managed" as const,
  autoSyncEnabled: false,
  status: "disabled" as const,
  githubProviderScope: "repository" as const,
  targetRepoId: "repo_00000000000000000000000001",
  targetGithubEnvironmentId: null,
  createdByUserId: "usr_00000000000000000000000001",
  disabledAt: new Date(),
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, fn) =>
      fn({
        db: {},
      }),
    ),
    TenantSecretSyncStore: class {
      getSecretSyncById = vi.fn(async () => disabledSync);
      listBindings = vi.fn(async () => []);
    },
    TenantAppConnectionStore: class {
      getConnectionById = vi.fn(async () => null);
    },
  };
});

describe("assertSecretSyncExecutable", () => {
  it("rejects disabled syncs", async () => {
    await expect(
      assertSecretSyncExecutable({
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.disabled,
    });
  });

  it("throws SecretSyncError for disabled syncs", async () => {
    await expect(
      assertSecretSyncExecutable({
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toBeInstanceOf(SecretSyncError);
  });
});
