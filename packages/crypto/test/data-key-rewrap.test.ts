import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mintOrganizationDataKey,
  mintProjectDataKey,
  unwrapOrganizationDataKeyBytes,
  unwrapProjectDataKeyBytes,
} from "../src/data-key-wrap.js";
import { DecryptError } from "../src/errors.js";
import {
  decryptSecretValueForRuntime,
  encryptSecretValue,
  type SecretCiphertextIdentity,
} from "../src/encryption.js";
import type {
  OrganizationDataKeyMetadata,
  ProjectDataKeyMetadata,
} from "../src/data-key-metadata.js";
import {
  DATA_KEY_VERSION_STATUSES,
  Keyring,
  MetadataTenantDataKeySource,
  StaticRootKeyProvider,
  TenantDataKeyNotReadyError,
  canRetireRootKeyBinding,
  rewrapTenantDataKeys,
  statusAfterRootRewrap,
  type TenantDataKeyRewrapStore,
} from "../src/index.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const OTHER_ORG = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const ENV = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const SECRET = secretId.brand("sec_01JZ8E8B9H3R7N1T6V8W0X2Y4A");

function identity(): SecretCiphertextIdentity {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    secretId: SECRET,
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

function expectBytesEqual(left: Uint8Array, right: Uint8Array): void {
  expect(bytesEqual(left, right)).toBe(true);
}

class InMemoryRewrapStore implements TenantDataKeyRewrapStore {
  readonly organizationUpdates: {
    readonly keyVersion: number;
    readonly input: {
      readonly wrappedStorageRef: string;
      readonly rootKeyVersion: number;
      readonly status: OrganizationDataKeyMetadata["status"];
    };
  }[] = [];

  readonly projectUpdates: {
    readonly projectId: typeof PROJECT;
    readonly keyVersion: number;
    readonly input: {
      readonly wrappedStorageRef: string;
      readonly status: ProjectDataKeyMetadata["status"];
    };
  }[] = [];

  constructor(
    private organizationKeys: OrganizationDataKeyMetadata[],
    private projectKeys: ProjectDataKeyMetadata[],
    private readonly options: { readonly persistOrganizationUpdates?: boolean } = {},
  ) {}

  listOrganizationDataKeys(): Promise<OrganizationDataKeyMetadata[]> {
    return Promise.resolve(this.organizationKeys);
  }

  listProjectDataKeys(): Promise<ProjectDataKeyMetadata[]> {
    return Promise.resolve(this.projectKeys);
  }

  updateOrganizationDataKeyWrap(
    _organizationId: typeof ORG,
    keyVersion: number,
    input: {
      wrappedStorageRef: string;
      rootKeyVersion: number;
      status: OrganizationDataKeyMetadata["status"];
    },
  ): Promise<void> {
    this.organizationUpdates.push({ keyVersion, input });
    if (this.options.persistOrganizationUpdates === false) {
      return Promise.resolve();
    }
    this.organizationKeys = this.organizationKeys.map((key) =>
      key.keyVersion === keyVersion
        ? {
            ...key,
            wrappedStorageRef: input.wrappedStorageRef,
            rootKeyVersion: input.rootKeyVersion,
            status: input.status,
          }
        : key,
    );
    return Promise.resolve();
  }

  updateProjectDataKeyWrap(
    _organizationId: typeof ORG,
    projectIdValue: typeof PROJECT,
    keyVersion: number,
    input: { wrappedStorageRef: string; status: ProjectDataKeyMetadata["status"] },
  ): Promise<void> {
    this.projectUpdates.push({ projectId: projectIdValue, keyVersion, input });
    this.projectKeys = this.projectKeys.map((key) =>
      key.projectId === projectIdValue && key.keyVersion === keyVersion
        ? {
            ...key,
            wrappedStorageRef: input.wrappedStorageRef,
            status: input.status,
          }
        : key,
    );
    return Promise.resolve();
  }
}

class MetadataReader {
  constructor(
    private readonly organizationKey: OrganizationDataKeyMetadata,
    private readonly projectKey: ProjectDataKeyMetadata,
  ) {}

  getActiveOrganizationDataKey(): Promise<OrganizationDataKeyMetadata> {
    return Promise.resolve(this.organizationKey);
  }

  getOrganizationDataKeyVersion(): Promise<OrganizationDataKeyMetadata> {
    return Promise.resolve(this.organizationKey);
  }

  getActiveProjectDataKey(): Promise<ProjectDataKeyMetadata> {
    return Promise.resolve(this.projectKey);
  }

  getProjectDataKeyVersion(): Promise<ProjectDataKeyMetadata> {
    return Promise.resolve(this.projectKey);
  }

  getOrganizationDataKeyForReadiness(): Promise<OrganizationDataKeyMetadata> {
    return Promise.resolve(this.organizationKey);
  }

  getProjectDataKeyForReadiness(): Promise<ProjectDataKeyMetadata> {
    return Promise.resolve(this.projectKey);
  }
}

describe("rewrapTenantDataKeys", () => {
  const rootV1 = new Uint8Array(32);
  const rootV2 = new Uint8Array(32);

  beforeEach(() => {
    crypto.getRandomValues(rootV1);
    crypto.getRandomValues(rootV2);
  });

  it("keeps record ciphertext decryptable after root rewrap", async () => {
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const orgMinted = await mintOrganizationDataKey(rootProvider, 1, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const projectMinted = await mintProjectDataKey(rootProvider, 1, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });

    const organizationKey: OrganizationDataKeyMetadata = {
      id: "odk_1",
      organizationId: ORG,
      keyVersion: 1,
      status: "active",
      rootKeyVersion: 1,
      wrappedStorageRef: orgMinted.wrappedStorageRef,
      custodyEvidenceRef: null,
    };
    const projectKey: ProjectDataKeyMetadata = {
      id: "pdk_1",
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
      status: "active",
      organizationDataKeyVersion: 1,
      wrappedStorageRef: projectMinted.wrappedStorageRef,
    };

    const reader = new MetadataReader(organizationKey, projectKey);
    const keyring = new Keyring(rootProvider, new MetadataTenantDataKeySource(reader));

    const wrapped = await encryptSecretValue(
      keyring,
      identity(),
      new TextEncoder().encode("payload"),
    );

    const store = new InMemoryRewrapStore([organizationKey], [projectKey]);
    await keyring.rewrapTenantDataKeys({
      organizationId: ORG,
      oldRootVersion: 1,
      newRootVersion: 2,
      store,
    });

    const updatedOrgKey = await store.listOrganizationDataKeys().then((rows) => rows[0]);
    expect(updatedOrgKey?.rootKeyVersion).toBe(2);
    if (!updatedOrgKey?.wrappedStorageRef) {
      throw new Error("expected updated organization wrapped ref");
    }
    const recoveredOrgKeyBytes = await unwrapOrganizationDataKeyBytes(
      rootV2,
      updatedOrgKey.wrappedStorageRef,
      {
        organizationId: ORG,
        keyVersion: 1,
      },
    );
    expectBytesEqual(recoveredOrgKeyBytes, orgMinted.dataKeyBytes);

    keyring.clearCacheForTests();
    const decrypted = await decryptSecretValueForRuntime(keyring, identity(), wrapped);
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe("payload");
  });

  it("never calls record decrypt functions during rewrap", async () => {
    const decryptModule = await import("../src/encryption.js");
    const decryptSpy = vi.spyOn(decryptModule, "decryptSecretValueForRuntime");
    const providerCredentialSpy = vi.spyOn(
      decryptModule,
      "decryptProviderCredentialForProviderUse",
    );
    const sensitiveMetadataSpy = vi.spyOn(
      decryptModule,
      "decryptSensitiveMetadataForAuthorizedRead",
    );

    const rootProvider = new StaticRootKeyProvider(rootV1);
    const orgMinted = await mintOrganizationDataKey(rootProvider, 1, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const projectMinted = await mintProjectDataKey(rootProvider, 1, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_1",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 1,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_1",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: projectMinted.wrappedStorageRef,
        },
      ],
    );

    const versionedRootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const organizationRows = await store.listOrganizationDataKeys();
    const projectRows = await store.listProjectDataKeys();
    const organizationRow = organizationRows[0];
    const projectRow = projectRows[0];
    if (!organizationRow || !projectRow) {
      throw new Error("expected seeded data key rows");
    }
    const keyring = new Keyring(
      versionedRootProvider,
      new MetadataTenantDataKeySource(new MetadataReader(organizationRow, projectRow)),
    );

    await keyring.rewrapTenantDataKeys({
      organizationId: ORG,
      oldRootVersion: 1,
      newRootVersion: 2,
      store,
    });

    expect(decryptSpy).not.toHaveBeenCalled();
    expect(providerCredentialSpy).not.toHaveBeenCalled();
    expect(sensitiveMetadataSpy).not.toHaveBeenCalled();

    decryptSpy.mockRestore();
    providerCredentialSpy.mockRestore();
    sensitiveMetadataSpy.mockRestore();
  });

  it("skips organization keys outside the old root and project keys already under the new root", async () => {
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const orgMinted = await mintOrganizationDataKey(rootProvider, 2, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const projectMinted = await mintProjectDataKey(rootProvider, 2, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_new_root",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 2,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_new_root",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: projectMinted.wrappedStorageRef,
        },
      ],
    );

    await rewrapTenantDataKeys({
      organizationId: ORG,
      oldRootVersion: 1,
      newRootVersion: 2,
      rootKeyProvider: rootProvider,
      store,
    });

    expect(store.organizationUpdates).toEqual([]);
    expect(store.projectUpdates).toEqual([]);
    const organizationRows = await store.listOrganizationDataKeys();
    const projectRows = await store.listProjectDataKeys();
    const organizationRow = organizationRows[0];
    const projectRow = projectRows[0];
    if (!organizationRow || !projectRow) {
      throw new Error("expected seeded data key rows");
    }
    expect(organizationRow.rootKeyVersion).toBe(2);
    expect(organizationRow.wrappedStorageRef === orgMinted.wrappedStorageRef).toBe(true);
    expect(projectRow.wrappedStorageRef === projectMinted.wrappedStorageRef).toBe(true);
  });

  it("rewraps project keys that still unwrap with the old root", async () => {
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const orgMinted = await mintOrganizationDataKey(rootProvider, 2, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const projectMinted = await mintProjectDataKey(rootProvider, 1, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_new_root",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 2,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_old_root",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "retired",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: projectMinted.wrappedStorageRef,
        },
      ],
    );

    await rewrapTenantDataKeys({
      organizationId: ORG,
      oldRootVersion: 1,
      newRootVersion: 2,
      rootKeyProvider: rootProvider,
      store,
    });

    expect(store.organizationUpdates).toEqual([]);
    expect(store.projectUpdates).toHaveLength(1);
    const projectUpdate = store.projectUpdates[0];
    if (!projectUpdate) {
      throw new Error("expected project rewrap update");
    }
    expect(projectUpdate).toMatchObject({
      projectId: PROJECT,
      keyVersion: 1,
      input: { status: "retired" },
    });
    const updatedProjectKey = await store.listProjectDataKeys().then((rows) => rows[0]);
    if (!updatedProjectKey?.wrappedStorageRef) {
      throw new Error("expected updated project wrapped ref");
    }
    const recoveredProjectKeyBytes = await unwrapProjectDataKeyBytes(
      rootV2,
      updatedProjectKey.wrappedStorageRef,
      {
        organizationId: ORG,
        projectId: PROJECT,
        keyVersion: 1,
      },
    );
    expectBytesEqual(recoveredProjectKeyBytes, projectMinted.dataKeyBytes);
  });

  it("fails closed when an old-root organization key is missing wrapped material", async () => {
    const rootProvider = new StaticRootKeyProvider(rootV1);
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_missing_ref",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 1,
          wrappedStorageRef: null,
          custodyEvidenceRef: null,
        },
      ],
      [],
    );

    await expect(
      rewrapTenantDataKeys({
        organizationId: ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        rootKeyProvider: rootProvider,
        store,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });

  it("fails closed when a project key is missing wrapped material", async () => {
    const rootProvider = new StaticRootKeyProvider(rootV1);
    const orgMinted = await mintOrganizationDataKey(rootProvider, 1, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_1",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 2,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_missing_ref",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: null,
        },
      ],
    );

    await expect(
      rewrapTenantDataKeys({
        organizationId: ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        rootKeyProvider: rootProvider,
        store,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });

  it("fails closed when a project wrapped ref is unreadable under old and new roots", async () => {
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const orgMinted = await mintOrganizationDataKey(rootProvider, 2, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const unreadableProjectMinted = await mintProjectDataKey(rootProvider, 1, {
      organizationId: OTHER_ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_new_root",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 2,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_unreadable",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: unreadableProjectMinted.wrappedStorageRef,
        },
      ],
    );

    await expect(
      rewrapTenantDataKeys({
        organizationId: ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        rootKeyProvider: rootProvider,
        store,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    expect(store.projectUpdates).toEqual([]);
  });

  it("propagates non-decrypt failures while probing a project under the old root", async () => {
    const setupRootProvider = {
      getRootKeyBytes(): Promise<Uint8Array> {
        return Promise.resolve(rootV1);
      },
    };
    const orgMinted = await mintOrganizationDataKey(setupRootProvider, 1, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const projectMinted = await mintProjectDataKey(setupRootProvider, 1, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_new_root",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 2,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_probe_old_failure",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: projectMinted.wrappedStorageRef,
        },
      ],
    );
    const invalidOldRootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? new Uint8Array(1) : rootV2);
      },
    };

    await expect(
      rewrapTenantDataKeys({
        organizationId: ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        rootKeyProvider: invalidOldRootProvider,
        store,
      }),
    ).rejects.toThrow("invalid root key length");
    expect(store.projectUpdates).toEqual([]);
  });

  it("propagates non-decrypt failures while probing a project under the new root", async () => {
    const setupRootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const orgMinted = await mintOrganizationDataKey(setupRootProvider, 2, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const projectMinted = await mintProjectDataKey(setupRootProvider, 2, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_new_root",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 2,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [
        {
          id: "pdk_probe_new_failure",
          organizationId: ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: projectMinted.wrappedStorageRef,
        },
      ],
    );
    const invalidNewRootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : new Uint8Array(1));
      },
    };

    await expect(
      rewrapTenantDataKeys({
        organizationId: ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        rootKeyProvider: invalidNewRootProvider,
        store,
      }),
    ).rejects.toThrow("invalid root key length");
    expect(store.projectUpdates).toEqual([]);
  });

  it("fails closed when updated organization keys still reference the retiring root", async () => {
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        return Promise.resolve(version === 1 ? rootV1 : rootV2);
      },
    };
    const orgMinted = await mintOrganizationDataKey(rootProvider, 1, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_old_root",
          organizationId: ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 1,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [],
      { persistOrganizationUpdates: false },
    );

    await expect(
      rewrapTenantDataKeys({
        organizationId: ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        rootKeyProvider: rootProvider,
        store,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    expect(store.organizationUpdates).toHaveLength(1);
  });

  it("fails closed for cross-tenant unwrap during rewrap", async () => {
    const rootProvider = new StaticRootKeyProvider(rootV1);
    const orgMinted = await mintOrganizationDataKey(rootProvider, 1, {
      organizationId: ORG,
      keyVersion: 1,
    });
    const store = new InMemoryRewrapStore(
      [
        {
          id: "odk_other",
          organizationId: OTHER_ORG,
          keyVersion: 1,
          status: "active",
          rootKeyVersion: 1,
          wrappedStorageRef: orgMinted.wrappedStorageRef,
          custodyEvidenceRef: null,
        },
      ],
      [],
    );
    const organizationRows = await store.listOrganizationDataKeys();
    const organizationRow = organizationRows[0];
    if (!organizationRow) {
      throw new Error("expected organization data key row");
    }
    const keyring = new Keyring(
      rootProvider,
      new MetadataTenantDataKeySource(
        new MetadataReader(organizationRow, {
          id: "pdk_1",
          organizationId: OTHER_ORG,
          projectId: PROJECT,
          keyVersion: 1,
          status: "active",
          organizationDataKeyVersion: 1,
          wrappedStorageRef: null,
        }),
      ),
    );

    await expect(
      keyring.rewrapTenantDataKeys({
        organizationId: OTHER_ORG,
        oldRootVersion: 1,
        newRootVersion: 2,
        store,
      }),
    ).rejects.toBeInstanceOf(DecryptError);
  });
});

describe("data key lifecycle rewrap decisions", () => {
  it("preserves every data-key status after root rewrap", () => {
    for (const status of DATA_KEY_VERSION_STATUSES) {
      expect(statusAfterRootRewrap(status)).toBe(status);
    }
  });

  it("allows root retirement only after all organization keys leave the old root", () => {
    expect(canRetireRootKeyBinding([], 1)).toBe(true);
    expect(canRetireRootKeyBinding([{ rootKeyVersion: 2 }, { rootKeyVersion: 3 }], 1)).toBe(true);
    expect(canRetireRootKeyBinding([{ rootKeyVersion: 2 }, { rootKeyVersion: 1 }], 1)).toBe(false);
  });
});
