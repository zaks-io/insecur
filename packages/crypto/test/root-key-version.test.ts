import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { configureKeyring, resetKeyringForTests } from "../src/crypto-runtime.js";
import { encryptSecretValue, type SecretCiphertextIdentity } from "../src/encryption.js";
import {
  MetadataTenantDataKeySource,
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataReader,
} from "../src/index.js";
import { Keyring, type KeyVersion, type RootKeyProvider } from "../src/keyring.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const ENV_A = environmentId.brand("env_01JZ8E6Z7F1P5L9R4T6U8V0W2Y");
const SECRET_A = secretId.brand("sec_01JZ8E8B9H3R3N1T6V8W0X2Y4A");

class VersionedRootKeyProvider implements RootKeyProvider {
  constructor(private readonly roots: ReadonlyMap<KeyVersion, Uint8Array>) {}

  getRootKeyBytes(version: KeyVersion): Promise<Uint8Array> {
    const bytes = this.roots.get(version);
    if (!bytes) {
      return Promise.reject(new Error("root key version not configured"));
    }
    return Promise.resolve(bytes);
  }
}

class RootV2MetadataReader implements TenantDataKeyMetadataReader {
  private readonly organizationKey: OrganizationDataKeyMetadata = {
    id: "odk_root_v2",
    organizationId: ORG_A,
    keyVersion: 1,
    status: "active",
    rootKeyVersion: 2,
    wrappedStorageRef: null,
    custodyEvidenceRef: null,
  };

  private readonly projectKey: ProjectDataKeyMetadata = {
    id: "pdk_root_v2",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    keyVersion: 1,
    status: "active",
    organizationDataKeyVersion: 1,
    wrappedStorageRef: null,
  };

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

function identity(): SecretCiphertextIdentity {
  return {
    organizationId: ORG_A,
    projectId: PROJECT_A,
    environmentId: ENV_A,
    secretId: SECRET_A,
  };
}

describe("root key version metadata", () => {
  const rootV1 = new Uint8Array(32);
  const rootV2 = new Uint8Array(32);

  beforeEach(() => {
    crypto.getRandomValues(rootV1);
    crypto.getRandomValues(rootV2);
    resetKeyringForTests();
  });

  it("resolves active versions with the organization root key version", async () => {
    const keyring = new Keyring(
      new VersionedRootKeyProvider(
        new Map([
          [1, rootV1],
          [2, rootV2],
        ]),
      ),
      new MetadataTenantDataKeySource(new RootV2MetadataReader()),
    );

    const versions = await keyring.getActiveDataKeyVersions(ORG_A, PROJECT_A);
    expect(versions.rootKeyVersion).toBe(2);
  });

  it("derives project keys from the metadata root version, not a hardcoded v1", async () => {
    const metadataReader = new RootV2MetadataReader();
    const correctRootKeyring = new Keyring(
      new VersionedRootKeyProvider(new Map([[2, rootV2]])),
      new MetadataTenantDataKeySource(metadataReader),
    );
    const wrongRootKeyring = new Keyring(
      new VersionedRootKeyProvider(new Map([[1, rootV1]])),
      new MetadataTenantDataKeySource(metadataReader),
    );

    configureKeyring(correctRootKeyring);
    const wrapped = await encryptSecretValue(identity(), new TextEncoder().encode("payload"));

    resetKeyringForTests();
    configureKeyring(wrongRootKeyring);

    await expect(
      encryptSecretValue(identity(), new TextEncoder().encode("payload")),
    ).rejects.toThrow();

    resetKeyringForTests();
    configureKeyring(correctRootKeyring);

    const { decryptSecretValueForRuntime } = await import("../src/encryption.js");
    const decrypted = await decryptSecretValueForRuntime(identity(), wrapped);
    expect(new TextDecoder().decode(decrypted.unwrapUtf8())).toBe("payload");
  });
});
