import { Keyring, type RootKeyProvider } from "@insecur/crypto";
import { TenantScopedDataKeyMetadataAccess } from "@insecur/tenant-store";
import { describe, expect, it } from "vitest";

import { createTenantBackedKeyring, createTenantBackedKeyringFromAccess } from "./index.js";

type OrganizationId = Parameters<
  TenantScopedDataKeyMetadataAccess["getActiveOrganizationDataKey"]
>[0];
type ProjectId = Parameters<TenantScopedDataKeyMetadataAccess["getActiveProjectDataKey"]>[1];

const ORG = "org_00000000000000000000000001" as OrganizationId;
const PROJECT = "prj_00000000000000000000000001" as ProjectId;

const rootKeyProvider: RootKeyProvider = {
  getRootKeyBytes(): Promise<Uint8Array> {
    return Promise.reject(
      new Error("root key bytes are not needed to construct the tenant-backed keyring"),
    );
  },
};

class RecordingMetadataAccess extends TenantScopedDataKeyMetadataAccess {
  readonly calls: string[] = [];

  override getActiveOrganizationDataKey(organizationId: OrganizationId) {
    this.calls.push(`active-org:${organizationId}`);
    return Promise.resolve({
      id: "odk_test",
      organizationId,
      keyVersion: 2,
      status: "active" as const,
      rootKeyVersion: 7,
      wrappedStorageRef: "inline:b64:org",
      custodyEvidenceRef: null,
    });
  }

  override getActiveProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    this.calls.push(`active-project:${organizationId}:${projectId}`);
    return Promise.resolve({
      id: "pdk_test",
      organizationId,
      projectId,
      keyVersion: 3,
      status: "active" as const,
      organizationDataKeyVersion: 2,
      wrappedStorageRef: "inline:b64:project",
    });
  }
}

describe("createTenantBackedKeyring", () => {
  it("constructs a Keyring using tenant-scoped metadata access", () => {
    expect(createTenantBackedKeyring(rootKeyProvider)).toBeInstanceOf(Keyring);
  });
});

describe("createTenantBackedKeyringFromAccess", () => {
  it("accepts explicit tenant-scoped metadata access for runtime composition", () => {
    const metadata = new TenantScopedDataKeyMetadataAccess();

    expect(createTenantBackedKeyringFromAccess(rootKeyProvider, metadata)).toBeInstanceOf(Keyring);
  });

  it("wires explicit tenant metadata access into active version reads", async () => {
    const metadata = new RecordingMetadataAccess();
    const keyring = createTenantBackedKeyringFromAccess(rootKeyProvider, metadata);

    await expect(keyring.getActiveOrganizationDataKeyVersions(ORG)).resolves.toEqual({
      rootKeyVersion: 7,
      organizationDataKeyVersion: 2,
    });
    metadata.calls.length = 0;

    await expect(keyring.getActiveDataKeyVersions(ORG, PROJECT)).resolves.toEqual({
      organizationId: ORG,
      projectId: PROJECT,
      rootKeyVersion: 7,
      organizationDataKeyVersion: 2,
      projectDataKeyVersion: 3,
    });
    expect(metadata.calls).toContain(`active-org:${ORG}`);
    expect(metadata.calls).toContain(`active-project:${ORG}:${PROJECT}`);
  });
});
