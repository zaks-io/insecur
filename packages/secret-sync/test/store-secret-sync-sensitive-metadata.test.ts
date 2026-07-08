import {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  createKeyring,
  type Keyring,
  type WrappedSensitiveMetadata,
} from "@insecur/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptSecretSyncBindingDestinationForAuthorizedRead,
  decryptSecretSyncWorkerScriptTargetForAuthorizedRead,
} from "../src/decrypt-secret-sync-sensitive-metadata.js";
import {
  loadSecretSyncSensitiveMetadata,
  storeSecretSyncBindingDestinations,
  storeSecretSyncWorkerScriptTarget,
} from "../src/store-secret-sync-sensitive-metadata.js";
import { BINDING, ORG, PROJECT, SYNC } from "./helpers/secret-sync-test-fixtures.js";

const storedFields = new Map<string, { wrapped: WrappedSensitiveMetadata }>();

function storageKey(input: {
  metadataType: string;
  recordResourceId: string;
  fieldKey: string;
}): string {
  return `${input.metadataType}:${input.recordResourceId}:${input.fieldKey}`;
}

const upsertField = vi.fn(
  async (input: {
    metadataType: string;
    recordResourceId: string;
    fieldKey: string;
    wrapped: WrappedSensitiveMetadata;
  }) => {
    storedFields.set(
      storageKey({
        metadataType: input.metadataType,
        recordResourceId: input.recordResourceId,
        fieldKey: input.fieldKey,
      }),
      { wrapped: input.wrapped },
    );
  },
);

const getField = vi.fn(
  async (input: { metadataType: string; recordResourceId: string; fieldKey: string }) =>
    storedFields.get(storageKey(input)) ?? null,
);

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

function createTestKeyring(): Keyring {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return createKeyring(root);
}

describe("storeSecretSyncSensitiveMetadata", () => {
  let keyring: Keyring;

  beforeEach(() => {
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    keyring = createTestKeyring();
    storedFields.clear();
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
      keyring,
      sensitiveMetadataStore,
    });

    const upsertPayload = upsertField.mock.calls[0]?.[0];
    expect(upsertPayload).toEqual(
      expect.objectContaining({
        metadataType: "secret_sync.binding",
        fieldKey: "provider_destination",
        wrapped: expect.objectContaining({
          organizationDataKeyVersion: expect.any(Number),
          projectDataKeyVersion: expect.any(Number),
          ciphertext: expect.any(Uint8Array),
        }),
      }),
    );
    expect(JSON.stringify(upsertPayload)).not.toContain("DATABASE_URL");

    const decrypted = await decryptSecretSyncBindingDestinationForAuthorizedRead(
      keyring,
      { organizationId: ORG, projectId: PROJECT, bindingId: BINDING },
      upsertPayload.wrapped,
    );
    expect(decrypted).toBe("DATABASE_URL");
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
      keyring,
      sensitiveMetadataStore,
    });

    const upsertPayload = upsertField.mock.calls[0]?.[0];
    expect(upsertPayload).toEqual(
      expect.objectContaining({
        metadataType: "secret_sync.target",
        fieldKey: "worker_script",
        wrapped: expect.objectContaining({
          organizationDataKeyVersion: expect.any(Number),
          projectDataKeyVersion: expect.any(Number),
          ciphertext: expect.any(Uint8Array),
        }),
      }),
    );
    expect(JSON.stringify(upsertPayload)).not.toContain("insecur-runtime");

    const decrypted = await decryptSecretSyncWorkerScriptTargetForAuthorizedRead(
      keyring,
      { organizationId: ORG, projectId: PROJECT, secretSyncId: SYNC },
      upsertPayload.wrapped,
    );
    expect(decrypted).toBe("insecur-runtime");
  });

  it("reports presence without decrypting sensitive metadata", async () => {
    const sensitiveMetadataStore = new (
      await import("@insecur/tenant-store")
    ).TenantSensitiveMetadataStore({} as never);

    await storeSecretSyncBindingDestinations({
      organizationId: ORG,
      projectId: PROJECT,
      secretSyncId: SYNC,
      bindings: [{ bindingId: BINDING, providerDestination: "DATABASE_URL" }],
      keyring,
      sensitiveMetadataStore,
    });

    const result = await loadSecretSyncSensitiveMetadata({
      db: {} as never,
      organizationId: ORG,
      projectId: PROJECT,
      secretSyncId: SYNC,
      bindingIds: [BINDING],
    });

    expect(result.bindingDestinations.get(BINDING)).toBe("present");
    expect(result.workerScriptName).toBeNull();
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  });
});
