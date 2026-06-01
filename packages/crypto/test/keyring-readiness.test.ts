import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataReader,
  checkTenantDataKeyReadiness,
} from "../src/index.js";
import { StaticRootKeyProvider } from "../src/keyring.js";

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
    private readonly organizationKey: OrganizationDataKeyMetadata | null,
    private readonly projectKey: ProjectDataKeyMetadata | null,
  ) {}

  getActiveOrganizationDataKey(): Promise<OrganizationDataKeyMetadata | null> {
    return Promise.resolve(this.organizationKey);
  }

  getOrganizationDataKeyVersion(): Promise<OrganizationDataKeyMetadata | null> {
    return Promise.resolve(this.organizationKey);
  }

  getActiveProjectDataKey(): Promise<ProjectDataKeyMetadata | null> {
    return Promise.resolve(this.projectKey);
  }

  getProjectDataKeyVersion(): Promise<ProjectDataKeyMetadata | null> {
    return Promise.resolve(this.projectKey);
  }
}

function createRootProvider(): StaticRootKeyProvider {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return new StaticRootKeyProvider(root);
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
    const mismatchedProject = {
      ...activeProjectKey(),
      organizationDataKeyVersion: 2,
    };

    const inactiveReport = await checkTenantDataKeyReadiness({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      metadata: new FakeMetadataReader(retiredOrganization, activeProjectKey()),
      rootKeyProvider: createRootProvider(),
    });
    expect(inactiveReport.issues.map((issue) => issue.code)).toContain(
      "organization_data_key.inactive",
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
});
