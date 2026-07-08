import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadExecutableSecretSyncContext } from "../src/load-executable-secret-sync-context.js";
import {
  BINDING,
  ORG,
  SYNC,
  createActiveGitHubSync,
  createBindingRow,
  createGitHubConnection,
} from "./helpers/secret-sync-test-fixtures.js";

const getSecretSyncById = vi.fn();
const listBindings = vi.fn();
const getConnectionById = vi.fn();
const getField = vi.fn();

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    TenantSecretSyncStore: class {
      getSecretSyncById = getSecretSyncById;
      listBindings = listBindings;
    },
    TenantAppConnectionStore: class {
      getConnectionById = getConnectionById;
    },
    TenantSensitiveMetadataStore: class {
      getField = getField;
    },
  };
});

const activeSync = createActiveGitHubSync();
const bindingRow = createBindingRow();

describe("loadExecutableSecretSyncContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSecretSyncById.mockResolvedValue(activeSync);
    listBindings.mockResolvedValue([bindingRow]);
    getConnectionById.mockResolvedValue(createGitHubConnection());
    getField.mockResolvedValue({ wrapped: {} });
  });

  it("loads executable sync context when bindings and destinations are present", async () => {
    const result = await loadExecutableSecretSyncContext({
      db: {} as never,
      organizationId: ORG,
      secretSyncId: SYNC,
    });

    expect(result.sync.id).toBe(SYNC);
    expect(result.bindings).toHaveLength(1);
  });

  it("rejects disabled syncs", async () => {
    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ status: "disabled", disabledAt: new Date() }),
    );

    await expect(
      loadExecutableSecretSyncContext({
        db: {} as never,
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.disabled });
  });

  it("rejects syncs without binding destinations", async () => {
    getField.mockResolvedValue(null);

    await expect(
      loadExecutableSecretSyncContext({
        db: {} as never,
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.invalidDestination });
  });

  it("rejects syncs with no bindings", async () => {
    listBindings.mockResolvedValue([]);

    await expect(
      loadExecutableSecretSyncContext({
        db: {} as never,
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.invalidBindings });
  });

  it("rejects missing sync rows", async () => {
    getSecretSyncById.mockResolvedValue(null);

    await expect(
      loadExecutableSecretSyncContext({
        db: {} as never,
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.notFound });
  });

  it("rejects ineligible app connections", async () => {
    getConnectionById.mockResolvedValue(null);

    await expect(
      loadExecutableSecretSyncContext({
        db: {} as never,
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.connectionNotEligible });
  });

  it("requires worker script targets for cloudflare syncs", async () => {
    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ kind: "cloudflare-worker-secret" }),
    );
    getField.mockImplementation(async (input) =>
      input.fieldKey === "provider_destination" ? { wrapped: {} } : null,
    );

    await expect(
      loadExecutableSecretSyncContext({
        db: {} as never,
        organizationId: ORG,
        secretSyncId: SYNC,
      }),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.invalidDestination });
  });

  it("accepts cloudflare syncs with worker script and binding destinations", async () => {
    getSecretSyncById.mockResolvedValue(
      createActiveGitHubSync({ kind: "cloudflare-worker-secret" }),
    );
    getField.mockResolvedValue({ wrapped: {} });

    const result = await loadExecutableSecretSyncContext({
      db: {} as never,
      organizationId: ORG,
      secretSyncId: SYNC,
    });

    expect(result.bindings[0]?.id).toBe(BINDING);
  });
});
