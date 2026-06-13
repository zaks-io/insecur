import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import type {
  OrganizationDataKeyMetadata,
  ProjectDataKeyMetadata,
  TenantDataKeyMetadataProvisioner,
  TenantDataKeyMetadataReader,
} from "../src/data-key-metadata.js";
import { PersistingMetadataTenantDataKeySource } from "../src/persisting-metadata-tenant-data-key-source.js";
import { StaticRootKeyProvider } from "../src/keyring.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ROOT = new Uint8Array(32).fill(7);

class InMemoryMetadata implements TenantDataKeyMetadataReader, TenantDataKeyMetadataProvisioner {
  private organizationRows = new Map<string, OrganizationDataKeyMetadata>();
  private projectRows = new Map<string, ProjectDataKeyMetadata>();

  getActiveOrganizationDataKey(organizationId: typeof ORG) {
    return Promise.resolve(
      [...this.organizationRows.values()].find(
        (row) => row.organizationId === organizationId && row.status === "active",
      ) ?? null,
    );
  }

  getOrganizationDataKeyVersion(organizationId: typeof ORG, keyVersion: number) {
    return Promise.resolve(
      this.organizationRows.get(`${organizationId}:${String(keyVersion)}`) ?? null,
    );
  }

  getActiveProjectDataKey(organizationId: typeof ORG, projectId: typeof PROJECT) {
    return Promise.resolve(
      [...this.projectRows.values()].find(
        (row) =>
          row.organizationId === organizationId &&
          row.projectId === projectId &&
          row.status === "active",
      ) ?? null,
    );
  }

  getProjectDataKeyVersion(
    organizationId: typeof ORG,
    projectId: typeof PROJECT,
    keyVersion: number,
  ) {
    return Promise.resolve(
      this.projectRows.get(`${organizationId}:${projectId}:${String(keyVersion)}`) ?? null,
    );
  }

  getOrganizationDataKeyForReadiness(organizationId: typeof ORG) {
    return this.getActiveOrganizationDataKey(organizationId);
  }

  getProjectDataKeyForReadiness(organizationId: typeof ORG, projectId: typeof PROJECT) {
    return this.getActiveProjectDataKey(organizationId, projectId);
  }

  persistOrganizationDataKey(input: {
    organizationId: typeof ORG;
    keyVersion: number;
    rootKeyVersion: number;
    wrappedStorageRef: string;
    rowId?: string;
  }): Promise<string> {
    const key = `${input.organizationId}:${String(input.keyVersion)}`;
    const existing = this.organizationRows.get(key);
    if (existing?.wrappedStorageRef) {
      return Promise.resolve(existing.wrappedStorageRef);
    }

    if (!existing) {
      this.organizationRows.set(key, {
        id: input.rowId ?? "odk_test",
        organizationId: input.organizationId,
        keyVersion: input.keyVersion,
        status: "active",
        rootKeyVersion: input.rootKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef,
        custodyEvidenceRef: null,
      });
    } else if (!existing.wrappedStorageRef) {
      this.organizationRows.set(key, {
        ...existing,
        wrappedStorageRef: input.wrappedStorageRef,
        rootKeyVersion: input.rootKeyVersion,
      });
    }

    const committed = this.organizationRows.get(key);
    if (!committed?.wrappedStorageRef) {
      throw new Error("expected committed organization wrapped ref");
    }
    return Promise.resolve(committed.wrappedStorageRef);
  }

  persistProjectDataKey(input: {
    organizationId: typeof ORG;
    projectId: typeof PROJECT;
    keyVersion: number;
    organizationDataKeyVersion: number;
    wrappedStorageRef: string;
    rowId?: string;
  }): Promise<string> {
    const key = `${input.organizationId}:${input.projectId}:${String(input.keyVersion)}`;
    const existing = this.projectRows.get(key);
    if (existing?.wrappedStorageRef) {
      return Promise.resolve(existing.wrappedStorageRef);
    }

    if (!existing) {
      this.projectRows.set(key, {
        id: input.rowId ?? "pdk_test",
        organizationId: input.organizationId,
        projectId: input.projectId,
        keyVersion: input.keyVersion,
        status: "active",
        organizationDataKeyVersion: input.organizationDataKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef,
      });
    } else if (!existing.wrappedStorageRef) {
      this.projectRows.set(key, {
        ...existing,
        wrappedStorageRef: input.wrappedStorageRef,
        organizationDataKeyVersion: input.organizationDataKeyVersion,
      });
    }

    const committed = this.projectRows.get(key);
    if (!committed?.wrappedStorageRef) {
      throw new Error("expected committed project wrapped ref");
    }
    return Promise.resolve(committed.wrappedStorageRef);
  }
}

describe("PersistingMetadataTenantDataKeySource", () => {
  it("mints and persists wrapped refs on first use, then reuses stored blobs", async () => {
    const metadata = new InMemoryMetadata();
    const rootProvider = new StaticRootKeyProvider(ROOT);
    const first = new PersistingMetadataTenantDataKeySource(rootProvider, metadata, metadata);
    const second = new PersistingMetadataTenantDataKeySource(rootProvider, metadata, metadata);

    const firstRef = await first.getOrganizationWrappedStorageRef(ORG, 1, 1);
    expect(firstRef).toMatch(/^inline:b64:/);

    const secondRef = await second.getOrganizationWrappedStorageRef(ORG, 1, 1);
    expect(secondRef).toBe(firstRef);

    await first.getActiveVersions(ORG, PROJECT);
    const projectRef = await second.getProjectWrappedStorageRef(ORG, PROJECT, 1, 1);
    expect(projectRef).toMatch(/^inline:b64:/);
  });

  it("returns the persisted ref when concurrent mints race on first use", async () => {
    const metadata = new InMemoryMetadata();
    const rootProvider = new StaticRootKeyProvider(ROOT);
    const left = new PersistingMetadataTenantDataKeySource(rootProvider, metadata, metadata);
    const right = new PersistingMetadataTenantDataKeySource(rootProvider, metadata, metadata);

    const [leftRef, rightRef] = await Promise.all([
      left.getOrganizationWrappedStorageRef(ORG, 1, 1),
      right.getOrganizationWrappedStorageRef(ORG, 1, 1),
    ]);

    expect(leftRef).toBe(rightRef);
    expect(leftRef).toMatch(/^inline:b64:/);
  });
});
