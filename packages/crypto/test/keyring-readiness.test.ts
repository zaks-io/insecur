import { organizationId, projectId, type OrganizationId, type ProjectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataReader,
  checkTenantDataKeyReadiness,
} from "../src/index.js";
import { StaticRootKeyProvider, type KeyVersion, type RootKeyProvider } from "../src/keyring.js";

const ORG_A = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const PROJECT_A = projectId.brand("prj_01JZ8E4X5D9N3J7P2Q4R6S8T0W");

function activeOrganizationKey(): OrganizationDataKeyMetadata {
  return {
    id: "odk_test_active",
    organizationId: ORG_A,
    keyVersion: 1,
    status: "active",
    rootKeyVersion: 1,
    wrappedStorageRef: "secrets-store://org/example/odk/v1",
    custodyEvidenceRef: "escrow-record://instance/example/root/v1",
  };
}

function activeProjectKey(): ProjectDataKeyMetadata {
  return {
    id: "pdk_test_active",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    keyVersion: 1,
    status: "active",
    organizationDataKeyVersion: 1,
    wrappedStorageRef: "secrets-store://org/example/pdk/v1",
  };
}

class FakeMetadataReader implements TenantDataKeyMetadataReader {
  constructor(
    private readonly readinessOrganizationKey: OrganizationDataKeyMetadata | null,
    private readonly readinessProjectKey: ProjectDataKeyMetadata | null,
  ) {}

  getActiveOrganizationDataKey(): Promise<OrganizationDataKeyMetadata | null> {
    const key = this.readinessOrganizationKey;
    return Promise.resolve(key?.status === "active" ? key : null);
  }

  getOrganizationDataKeyVersion(
    _organizationId: OrganizationId,
    keyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyMetadata | null> {
    const key = this.readinessOrganizationKey;
    return Promise.resolve(key?.keyVersion === keyVersion ? key : null);
  }

  getActiveProjectDataKey(): Promise<ProjectDataKeyMetadata | null> {
    const key = this.readinessProjectKey;
    return Promise.resolve(key?.status === "active" ? key : null);
  }

  getProjectDataKeyVersion(
    _organizationId: OrganizationId,
    _projectId: ProjectId,
    keyVersion: KeyVersion,
  ): Promise<ProjectDataKeyMetadata | null> {
    const key = this.readinessProjectKey;
    return Promise.resolve(key?.keyVersion === keyVersion ? key : null);
  }

  getOrganizationDataKeyForReadiness(): Promise<OrganizationDataKeyMetadata | null> {
    return Promise.resolve(this.readinessOrganizationKey);
  }

  getProjectDataKeyForReadiness(): Promise<ProjectDataKeyMetadata | null> {
    return Promise.resolve(this.readinessProjectKey);
  }
}

function createRootProvider(): StaticRootKeyProvider {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return new StaticRootKeyProvider(root);
}

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

describe("checkTenantDataKeyReadiness", () => {
  it("reports ready when root and active tenant keys are present", async () => {
    const report = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(activeOrganizationKey(), activeProjectKey()),
      rootKeyProvider: createRootProvider(),
    });

    expect(report.status).toBe("ready");
    expect(report.issues).toEqual([]);
  });

  it("reports missing organization and project keys without exposing material", async () => {
    const report = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(null, null),
      rootKeyProvider: createRootProvider(),
    });

    expect(report.status).toBe("not_ready");
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "organization_data_key.missing",
      "project_data_key.missing",
    ]);
    expect(JSON.stringify(report)).not.toMatch(/[0-9a-f]{32,}/i);
  });

  it("reports inactive keys and org-version mismatch", async () => {
    const retiredOrganization = { ...activeOrganizationKey(), status: "retired" as const };
    const retiredProject = { ...activeProjectKey(), status: "revoked" as const };
    const mismatchedProject = {
      ...activeProjectKey(),
      organizationDataKeyVersion: 2,
    };

    const inactiveOrgReport = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(retiredOrganization, activeProjectKey()),
      rootKeyProvider: createRootProvider(),
    });
    expect(inactiveOrgReport.issues.map((issue) => issue.code)).toContain(
      "organization_data_key.inactive",
    );
    expect(inactiveOrgReport.issues.map((issue) => issue.code)).not.toContain(
      "organization_data_key.missing",
    );

    const inactiveProjectReport = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(activeOrganizationKey(), retiredProject),
      rootKeyProvider: createRootProvider(),
    });
    expect(inactiveProjectReport.issues.map((issue) => issue.code)).toContain(
      "project_data_key.inactive",
    );
    expect(inactiveProjectReport.issues.map((issue) => issue.code)).not.toContain(
      "project_data_key.missing",
    );

    const mismatchReport = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(activeOrganizationKey(), mismatchedProject),
      rootKeyProvider: createRootProvider(),
    });
    expect(mismatchReport.issues.map((issue) => issue.code)).toContain(
      "project_data_key.org_version_mismatch",
    );
  });

  it("probes root reachability using the organization key root version", async () => {
    const rootV2 = new Uint8Array(32);
    crypto.getRandomValues(rootV2);
    const organizationKey = { ...activeOrganizationKey(), rootKeyVersion: 2 };

    const reachableReport = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(organizationKey, activeProjectKey()),
      rootKeyProvider: new VersionedRootKeyProvider(new Map([[2, rootV2]])),
    });
    expect(reachableReport.status).toBe("ready");

    const unreachableReport = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(organizationKey, activeProjectKey()),
      rootKeyProvider: new VersionedRootKeyProvider(new Map([[1, rootV2]])),
    });
    expect(unreachableReport.issues.map((issue) => issue.code)).toContain("root_key.unreachable");
  });
});
