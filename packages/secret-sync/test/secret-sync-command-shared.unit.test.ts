import { requestId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSecretSyncCommandAuditScope,
  runScopedSecretSyncMutation,
  toMetadataSafeSecretSyncView,
} from "../src/secret-sync-command-shared.js";
import {
  ENV,
  ORG,
  PROJECT,
  SYNC,
  USER,
  createActiveGitHubSync,
  createBindingRow,
} from "./helpers/secret-sync-test-fixtures.js";

const getSecretSyncById = vi.fn();
const getField = vi.fn();

vi.mock("../src/assert-secret-sync-access.js", () => ({
  resolveSecretSyncManageAccess: vi.fn(async () => undefined),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, run) => run({ db: {} as never })),
    TenantSecretSyncStore: class {
      getSecretSyncById = getSecretSyncById;
    },
    TenantSensitiveMetadataStore: class {
      getField = getField;
    },
  };
});

const activeSync = createActiveGitHubSync();
const bindingRow = createBindingRow();

describe("secret sync command shared helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSecretSyncById.mockResolvedValue(activeSync);
    getField.mockResolvedValue({ wrapped: {} });
  });

  it("builds audit scope with request id", () => {
    const req = requestId.generate();
    const scope = buildSecretSyncCommandAuditScope({
      actorUserId: USER,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      requestId: req,
    });

    expect(scope.request.requestId).toBe(req);
  });

  it("loads metadata-safe views without provider destination plaintext", async () => {
    const view = await toMetadataSafeSecretSyncView({
      db: {} as never,
      sync: activeSync,
      bindings: [bindingRow],
    });

    expect(view.bindings[0]?.hasProviderDestination).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/DATABASE_URL/);
  });

  it("runs scoped mutations against an existing sync", async () => {
    const result = await runScopedSecretSyncMutation({
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretSyncId: SYNC,
      run: async ({ existing }) => existing.id,
    });

    expect(result).toBe(SYNC);
  });
});
