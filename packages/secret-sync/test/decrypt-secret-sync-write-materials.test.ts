import { PlaintextHandle } from "@insecur/crypto";
import { SECRET_SYNC_ERROR_CODES, secretVersionId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  decryptSecretValueForRuntimeMock,
  decryptSensitiveMetadataForAuthorizedReadMock,
  getField,
  getCurrentVersion,
} = vi.hoisted(() => ({
  decryptSecretValueForRuntimeMock: vi.fn(),
  decryptSensitiveMetadataForAuthorizedReadMock: vi.fn(),
  getField: vi.fn(),
  getCurrentVersion: vi.fn(),
}));

vi.mock("@insecur/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/crypto")>();
  return {
    ...actual,
    decryptSecretValueForRuntime: decryptSecretValueForRuntimeMock,
    decryptSensitiveMetadataForAuthorizedRead: decryptSensitiveMetadataForAuthorizedReadMock,
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, run: (ctx: { db: never }) => unknown) =>
      run({ db: {} as never }),
    ),
    TenantSensitiveMetadataStore: class {
      getField = getField;
    },
    TenantSecretVersionStore: class {
      getCurrentVersion = getCurrentVersion;
    },
  };
});

import {
  createSecretSyncDestinationNameDecryptor,
  createSecretSyncWriteMaterialsDecryptor,
} from "../src/decrypt-secret-sync-write-materials.js";
import { BINDING, ENV, ORG, PROJECT, SECRET, SYNC } from "./helpers/secret-sync-test-fixtures.js";

const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const KEYRING = {} as never;

function resolveInput() {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    secretSyncId: SYNC,
    bindings: [{ bindingId: BINDING, secretId: SECRET }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getField.mockResolvedValue({ wrapped: { ciphertext: new Uint8Array([1]) } });
  getCurrentVersion.mockResolvedValue({
    secretVersionId: VERSION,
    secretId: SECRET,
    versionNumber: 1,
    lifecycleState: "live",
    organizationDataKeyVersion: 1,
    projectDataKeyVersion: 1,
    wrapped: { ciphertext: new Uint8Array([2]) },
  });
  decryptSensitiveMetadataForAuthorizedReadMock.mockResolvedValue(
    new PlaintextHandle(new TextEncoder().encode("DEPLOY_TOKEN")),
  );
  decryptSecretValueForRuntimeMock.mockResolvedValue(
    new PlaintextHandle(new TextEncoder().encode("value-bytes")),
  );
});

describe("createSecretSyncWriteMaterialsDecryptor", () => {
  it("returns decrypted destination names and current version values per binding", async () => {
    const resolver = createSecretSyncWriteMaterialsDecryptor(KEYRING);

    const materials = await resolver.resolveWriteMaterials(resolveInput());

    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({
      bindingId: BINDING,
      secretId: SECRET,
      secretVersionId: VERSION,
      destinationName: "DEPLOY_TOKEN",
    });
    expect(new TextDecoder().decode(materials[0]?.value.unwrapUtf8())).toBe("value-bytes");
    // Value decrypt is identity-bound to the exact tenant coordinate.
    expect(decryptSecretValueForRuntimeMock).toHaveBeenCalledWith(
      KEYRING,
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV, secretId: SECRET },
      expect.anything(),
    );
  });

  it("fails the whole set with source_value_missing before any decrypt", async () => {
    getCurrentVersion.mockResolvedValue(null);
    const resolver = createSecretSyncWriteMaterialsDecryptor(KEYRING);

    await expect(resolver.resolveWriteMaterials(resolveInput())).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.sourceValueMissing,
    });
    expect(decryptSecretValueForRuntimeMock).not.toHaveBeenCalled();
    expect(decryptSensitiveMetadataForAuthorizedReadMock).not.toHaveBeenCalled();
  });

  it("fails closed when a binding destination is not configured", async () => {
    getField.mockResolvedValue(null);
    const resolver = createSecretSyncWriteMaterialsDecryptor(KEYRING);

    await expect(resolver.resolveWriteMaterials(resolveInput())).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.invalidDestination,
    });
    expect(decryptSecretValueForRuntimeMock).not.toHaveBeenCalled();
  });
});

describe("createSecretSyncDestinationNameDecryptor", () => {
  it("resolves one exact binding destination name", async () => {
    const resolver = createSecretSyncDestinationNameDecryptor({
      keyring: KEYRING,
      projectId: PROJECT,
    });

    const name = await resolver.resolveDestinationName({
      organizationId: ORG,
      secretSyncId: SYNC,
      bindingId: BINDING,
    });

    expect(name).toBe("DEPLOY_TOKEN");
    expect(getField).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        scopeProjectId: PROJECT,
        metadataType: "secret_sync.binding",
        fieldKey: "provider_destination",
      }),
    );
  });
});
