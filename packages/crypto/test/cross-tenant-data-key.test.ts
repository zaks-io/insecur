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

function defaultOrganizationKey(
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

function defaultProjectKey(
  overrides: Partial<ProjectDataKeyMetadata> = {},
): ProjectDataKeyMetadata {
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

class ScopedMetadataReader implements TenantDataKeyMetadataReader {
  private readonly projectKeysByVersion = new Map<string, ProjectDataKeyMetadata>();

  constructor(
    private readonly scopeOrganizationId: typeof ORG_A,
    private readonly organizationKey: OrganizationDataKeyMetadata,
    activeProjectKey: ProjectDataKeyMetadata | null,
    additionalProjectKeys: ProjectDataKeyMetadata[] = [],
  ) {
    const projectKeys = [...(activeProjectKey ? [activeProjectKey] : []), ...additionalProjectKeys];
    for (const key of projectKeys) {
      this.projectKeysByVersion.set(`${key.projectId}:${String(key.keyVersion)}`, key);
    }
    this.activeProjectKey = activeProjectKey;
  }

  private readonly activeProjectKey: ProjectDataKeyMetadata | null;

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
    if (this.activeProjectKey?.projectId !== projectId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.activeProjectKey);
  }

  getProjectDataKeyVersion(
    organizationId: typeof ORG_A,
    projectId: typeof PROJECT_A,
    keyVersion: number,
  ): Promise<ProjectDataKeyMetadata | null> {
    if (organizationId !== this.scopeOrganizationId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      this.projectKeysByVersion.get(`${projectId}:${String(keyVersion)}`) ?? null,
    );
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

function createScopedKeyring(
  organizationKey: OrganizationDataKeyMetadata,
  activeProjectKey: ProjectDataKeyMetadata | null,
  additionalProjectKeys: ProjectDataKeyMetadata[] = [],
): Keyring {
  const reader = new ScopedMetadataReader(
    ORG_A,
    organizationKey,
    activeProjectKey,
    additionalProjectKeys,
  );
  return new Keyring(createRootProvider(), new MetadataTenantDataKeySource(reader));
}

function createRootProvider(): StaticRootKeyProvider {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return new StaticRootKeyProvider(root);
}

describe("cross-tenant tenant data key resolution", () => {
  let keyring: Keyring;

  beforeEach(() => {
    keyring = createScopedKeyring(defaultOrganizationKey(), defaultProjectKey());
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

  describe("present-but-invalid metadata", () => {
    it("rejects a present organization key whose status is not active", async () => {
      const invalidKeyring = createScopedKeyring(
        defaultOrganizationKey({ status: "retired" }),
        defaultProjectKey(),
      );

      await expect(
        invalidKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A),
      ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    });

    it("rejects a present project key whose status is not active", async () => {
      const invalidKeyring = createScopedKeyring(
        defaultOrganizationKey(),
        defaultProjectKey({ status: "revoked" }),
      );

      await expect(
        invalidKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A),
      ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    });

    it("rejects active keys whose organization version linkage does not match via getActiveVersions", async () => {
      const invalidKeyring = createScopedKeyring(
        defaultOrganizationKey({ keyVersion: 1 }),
        defaultProjectKey({ organizationDataKeyVersion: 2 }),
      );

      await expect(
        invalidKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A),
      ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    });

    it("rejects active keys whose organization version linkage does not match via resolveVersions", async () => {
      const invalidKeyring = createScopedKeyring(
        defaultOrganizationKey({ keyVersion: 1 }),
        defaultProjectKey({ organizationDataKeyVersion: 2 }),
      );

      await expect(
        invalidKeyring.getProjectDataKey(ORG_A, PROJECT_A, {
          organizationDataKeyVersion: 1,
          projectDataKeyVersion: 1,
        }),
      ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    });

    it("rejects a historical project version whose linkage does not match via resolveVersions", async () => {
      const activeOrg = defaultOrganizationKey({ keyVersion: 2 });
      const activeProject = defaultProjectKey({
        keyVersion: 2,
        organizationDataKeyVersion: 2,
      });
      const historicalProject = defaultProjectKey({
        id: "pdk_project_a_v1",
        keyVersion: 1,
        organizationDataKeyVersion: 1,
      });
      const validKeyring = createScopedKeyring(activeOrg, activeProject, [historicalProject]);

      await expect(validKeyring.getActiveDataKeyVersions(ORG_A, PROJECT_A)).resolves.toMatchObject({
        organizationDataKeyVersion: 2,
        projectDataKeyVersion: 2,
      });

      await expect(
        validKeyring.getProjectDataKey(ORG_A, PROJECT_A, {
          organizationDataKeyVersion: 2,
          projectDataKeyVersion: 1,
        }),
      ).rejects.toBeInstanceOf(TenantDataKeyNotReadyError);
    });
  });
});
