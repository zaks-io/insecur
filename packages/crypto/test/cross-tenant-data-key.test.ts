import { organizationId, projectId } from "@insecur/domain";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MetadataTenantDataKeySource,
  TenantDataKeyNotReadyError,
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataReader,
} from "../src/index.js";
import { Keyring, StaticRootKeyProvider } from "../src/keyring.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const ORG_B = organizationId.brand("org_01JZ8E3W4C8M2H6N9P1Q3R5T7U");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");
const PROJECT_B = projectId.brand("prj_01JZ8E5Y6E0O4K8Q3R5S7T9U1X");

class ScopedMetadataReader implements TenantDataKeyMetadataReader {
  constructor(
    private readonly scopeOrganizationId: typeof ORG_A,
    private readonly organizationKey: OrganizationDataKeyMetadata,
    private readonly projectKeys: Map<string, ProjectDataKeyMetadata>,
  ) {}

  getActiveOrganizationDataKey(
    organizationId: typeof ORG_A,
  ): Promise<OrganizationDataKeyMetadata | null> {
    return Promise.resolve(
      organizationId === this.scopeOrganizationId ? this.organizationKey : null,
    );
  }

  getOrganizationDataKeyVersion(
    organizationId: typeof ORG_A,
    keyVersion: number,
  ): Promise<OrganizationDataKeyMetadata | null> {
    if (organizationId !== this.scopeOrganizationId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      this.organizationKey.keyVersion === keyVersion ? this.organizationKey : null,
    );
  }

  getActiveProjectDataKey(
    organizationId: typeof ORG_A,
    projectId: typeof PROJECT_A,
  ): Promise<ProjectDataKeyMetadata | null> {
    if (organizationId !== this.scopeOrganizationId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.projectKeys.get(projectId) ?? null);
  }

  getProjectDataKeyVersion(
    organizationId: typeof ORG_A,
    projectId: typeof PROJECT_A,
    keyVersion: number,
  ): Promise<ProjectDataKeyMetadata | null> {
    if (organizationId !== this.scopeOrganizationId) {
      return Promise.resolve(null);
    }
    const key = this.projectKeys.get(projectId);
    return Promise.resolve(key?.keyVersion === keyVersion ? key : null);
  }

  getOrganizationDataKeyForReadiness(
    organizationId: typeof ORG_A,
  ): Promise<OrganizationDataKeyMetadata | null> {
    return this.getActiveOrganizationDataKey(organizationId);
  }

  getProjectDataKeyForReadiness(
    organizationId: typeof ORG_A,
    projectId: typeof PROJECT_A,
  ): Promise<ProjectDataKeyMetadata | null> {
    return this.getActiveProjectDataKey(organizationId, projectId);
  }
}

function createRootProvider(): StaticRootKeyProvider {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return new StaticRootKeyProvider(root);
}

function activeOrganizationKey(
  overrides: Partial<OrganizationDataKeyMetadata> = {},
): OrganizationDataKeyMetadata {
  return {
    id: "odk_org_a",
    organizationId: ORG_A,
    keyVersion: 1,
    status: "active",
    rootKeyVersion: 1,
    wrappedStorageRef: null,
    custodyEvidenceRef: null,
    ...overrides,
  };
}

function activeProjectKey(overrides: Partial<ProjectDataKeyMetadata> = {}): ProjectDataKeyMetadata {
  return {
    id: "pdk_project_a",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    keyVersion: 1,
    status: "active",
    organizationDataKeyVersion: 1,
    wrappedStorageRef: null,
    ...overrides,
  };
}

function createKeyring(
  organizationKey: OrganizationDataKeyMetadata,
  projectKeys: Map<string, ProjectDataKeyMetadata>,
): Keyring {
  const reader = new ScopedMetadataReader(ORG_A, organizationKey, projectKeys);
  return new Keyring(createRootProvider(), new MetadataTenantDataKeySource(reader));
}

describe("cross-tenant tenant data key resolution", () => {
  let keyring: Keyring;

  beforeEach(() => {
    keyring = createKeyring(activeOrganizationKey(), new Map([[PROJECT_A, activeProjectKey()]]));
  });

  it("resolves active versions only for the scoped organization", async () => {
    const versions = await keyring.getActiveDataKeyVersions(ORG_A, PROJECT_A);
    expect(versions.rootKeyVersion).toBe(1);
    expect(versions.organizationDataKeyVersion).toBe(1);
    expect(versions.projectDataKeyVersion).toBe(1);
  });

  it("fails closed when another organization is requested", async () => {
    await expect(keyring.getActiveDataKeyVersions(ORG_B, PROJECT_B)).rejects.toBeInstanceOf(
      TenantDataKeyNotReadyError,
    );
  });

  it("fails closed when a project from another tenant is requested under org A scope", async () => {
    await expect(keyring.getActiveDataKeyVersions(ORG_A, PROJECT_B)).rejects.toBeInstanceOf(
      TenantDataKeyNotReadyError,
    );
  });

  it("does not derive a project data key for cross-tenant version resolution", async () => {
    await expect(
      keyring.getProjectDataKey(ORG_B, PROJECT_B, {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 1,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);

    await expect(
      keyring.getProjectDataKey(ORG_A, PROJECT_B, {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 1,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });

  it("fails closed when the active organization key is present but not active", async () => {
    const inactiveOrgKeyring = createKeyring(
      activeOrganizationKey({ status: "retired" }),
      new Map([[PROJECT_A, activeProjectKey()]]),
    );

    await expect(
      inactiveOrgKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });

  it("fails closed when the active project key is present but not active", async () => {
    const inactiveProjectKeyring = createKeyring(
      activeOrganizationKey(),
      new Map([[PROJECT_A, activeProjectKey({ status: "revoked" })]]),
    );

    await expect(
      inactiveProjectKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });

  it("fails closed when active keys disagree on organization data key version linkage", async () => {
    const linkageMismatchKeyring = createKeyring(
      activeOrganizationKey({ keyVersion: 1 }),
      new Map([[PROJECT_A, activeProjectKey({ organizationDataKeyVersion: 2 })]]),
    );

    await expect(
      linkageMismatchKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });

  it("fails closed when resolved organization and project key versions are linkage-mismatched", async () => {
    const orgVersionOneProjectClaimsOrgVersionTwo = createKeyring(
      activeOrganizationKey({ keyVersion: 1 }),
      new Map([[PROJECT_A, activeProjectKey({ organizationDataKeyVersion: 2 })]]),
    );

    await expect(
      orgVersionOneProjectClaimsOrgVersionTwo.getProjectDataKey(ORG_A, PROJECT_A, {
        organizationDataKeyVersion: 1,
        projectDataKeyVersion: 1,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);

    const orgVersionTwoProjectClaimsOrgVersionOne = createKeyring(
      activeOrganizationKey({ keyVersion: 2 }),
      new Map([[PROJECT_A, activeProjectKey({ organizationDataKeyVersion: 1 })]]),
    );

    await expect(
      orgVersionTwoProjectClaimsOrgVersionOne.getProjectDataKey(ORG_A, PROJECT_A, {
        organizationDataKeyVersion: 2,
        projectDataKeyVersion: 1,
      }),
    ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
  });
});
