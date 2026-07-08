import { createKeyring } from "@insecur/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadSecretSyncSensitiveMetadata,
  storeSecretSyncBindingDestinations,
  storeSecretSyncWorkerScriptTarget,
} from "../src/store-secret-sync-sensitive-metadata.js";
import { BINDING, ORG, PROJECT, SYNC } from "./helpers/secret-sync-test-fixtures.js";

const KEYRING = createKeyring(new Uint8Array(32).fill(9));

const upsertField = vi.fn(async () => undefined);
const getField = vi.fn(async () => null);

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    TenantSensitiveMetadataStore: class {
      upsertField = upsertField;
      getField = getField;
    },
  };
});

describe("storeSecretSyncSensitiveMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts binding destinations without storing plaintext in tenant rows", async () => {
    const sensitiveMetadataStore = new (
      await import("@insecur/tenant-store")
    ).TenantSensitiveMetadataStore({} as never);

    await storeSecretSyncBindingDestinations({
      organizationId: ORG,
      projectId: PROJECT,
      secretSyncId: SYNC,
      bindings: [{ bindingId: BINDING, providerDestination: "DATABASE_URL" }],
      keyring: KEYRING,
      sensitiveMetadataStore,
    });

    expect(upsertField).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataType: "secret_sync.binding",
        fieldKey: "provider_destination",
        wrapped: expect.objectContaining({
          organizationDataKeyVersion: expect.any(Number),
          projectDataKeyVersion: expect.any(Number),
        }),
      }),
    );
    const payload = JSON.stringify(upsertField.mock.calls[0]?.[0]);
    expect(payload).not.toContain("DATABASE_URL");
  });

  it("stores worker script targets as encrypted sensitive metadata", async () => {
    const sensitiveMetadataStore = new (
      await import("@insecur/tenant-store")
    ).TenantSensitiveMetadataStore({} as never);

    await storeSecretSyncWorkerScriptTarget({
      organizationId: ORG,
      projectId: PROJECT,
      secretSyncId: SYNC,
      workerScriptName: "insecur-runtime",
      keyring: KEYRING,
      sensitiveMetadataStore,
    });

    expect(upsertField).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataType: "secret_sync.target",
        fieldKey: "worker_script",
      }),
    );
  });

  it("reports presence without decrypting sensitive metadata", async () => {
    getField.mockImplementation(async (input) =>
      input.fieldKey === "provider_destination" ? { wrapped: {} } : null,
    );

    const result = await loadSecretSyncSensitiveMetadata({
      db: {} as never,
      organizationId: ORG,
      projectId: PROJECT,
      secretSyncId: SYNC,
      bindingIds: [BINDING],
    });

    expect(result.bindingDestinations.get(BINDING)).toBe("present");
    expect(result.workerScriptName).toBeNull();
  });
});
