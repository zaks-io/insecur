import type { OrganizationId, ProjectId } from "@insecur/domain";

import {
  DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
  DEFAULT_PROJECT_DATA_KEY_VERSION,
  DEFAULT_ROOT_KEY_VERSION,
} from "./constants.js";
import type {
  TenantDataKeyMetadataProvisioner,
  TenantDataKeyMetadataReader,
} from "./data-key-metadata.js";
import { mintOrganizationDataKey, mintProjectDataKey } from "./data-key-wrap.js";
import { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
import { MetadataTenantDataKeySource } from "./metadata-tenant-data-key-source.js";
import type {
  ActiveDataKeyVersions,
  DataKeyVersions,
  KeyVersion,
  OrganizationDataKeyVersions,
  RootKeyProvider,
  TenantDataKeySource,
} from "./keyring.js";

/**
 * Production data-key source: reads wrapped refs from tenant metadata and mints+persist
 * inline blobs on first use when a row exists without `wrapped_storage_ref`.
 */
export class PersistingMetadataTenantDataKeySource implements TenantDataKeySource {
  private readonly delegate: MetadataTenantDataKeySource;

  constructor(
    private readonly rootKeyProvider: RootKeyProvider,
    private readonly reader: TenantDataKeyMetadataReader,
    private readonly provisioner: TenantDataKeyMetadataProvisioner,
  ) {
    this.delegate = new MetadataTenantDataKeySource(reader);
  }

  async getActiveOrganizationVersions(
    organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyVersions> {
    await this.ensureActiveOrganizationKey(organizationId);
    return this.delegate.getActiveOrganizationVersions(organizationId);
  }

  async resolveOrganizationVersions(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyVersions> {
    return this.delegate.resolveOrganizationVersions(organizationId, organizationDataKeyVersion);
  }

  async getActiveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ActiveDataKeyVersions> {
    await this.ensureActiveOrganizationKey(organizationId);
    await this.ensureActiveProjectKey(organizationId, projectId);
    return this.delegate.getActiveVersions(organizationId, projectId);
  }

  async resolveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<ActiveDataKeyVersions> {
    return this.delegate.resolveVersions(organizationId, projectId, versions);
  }

  async getOrganizationWrappedStorageRef(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    const existing = await this.reader.getOrganizationDataKeyVersion(
      organizationId,
      organizationDataKeyVersion,
    );
    if (existing?.wrappedStorageRef) {
      return existing.wrappedStorageRef;
    }
    const minted = await mintOrganizationDataKey(this.rootKeyProvider, rootKeyVersion, {
      organizationId,
      keyVersion: organizationDataKeyVersion,
    });
    await this.provisioner.persistOrganizationDataKey({
      organizationId,
      keyVersion: organizationDataKeyVersion,
      rootKeyVersion,
      wrappedStorageRef: minted.wrappedStorageRef,
      ...(existing?.id !== undefined ? { rowId: existing.id } : {}),
    });
    return minted.wrappedStorageRef;
  }

  async getProjectWrappedStorageRef(
    organizationId: OrganizationId,
    projectId: ProjectId,
    projectDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    const existing = await this.reader.getProjectDataKeyVersion(
      organizationId,
      projectId,
      projectDataKeyVersion,
    );
    if (existing?.wrappedStorageRef) {
      return existing.wrappedStorageRef;
    }
    const minted = await mintProjectDataKey(this.rootKeyProvider, rootKeyVersion, {
      organizationId,
      projectId,
      keyVersion: projectDataKeyVersion,
    });
    await this.provisioner.persistProjectDataKey({
      organizationId,
      projectId,
      keyVersion: projectDataKeyVersion,
      organizationDataKeyVersion:
        existing?.organizationDataKeyVersion ?? DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
      wrappedStorageRef: minted.wrappedStorageRef,
      ...(existing?.id !== undefined ? { rowId: existing.id } : {}),
    });
    return minted.wrappedStorageRef;
  }

  private async ensureActiveOrganizationKey(organizationId: OrganizationId): Promise<void> {
    const active = await this.reader.getActiveOrganizationDataKey(organizationId);
    if (!active) {
      const rootKeyVersion = DEFAULT_ROOT_KEY_VERSION;
      const keyVersion = DEFAULT_ORGANIZATION_DATA_KEY_VERSION;
      await this.getOrganizationWrappedStorageRef(organizationId, keyVersion, rootKeyVersion);
      return;
    }
    if (!active.wrappedStorageRef) {
      await this.getOrganizationWrappedStorageRef(
        organizationId,
        active.keyVersion,
        active.rootKeyVersion,
      );
    }
  }

  private async ensureActiveProjectKey(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<void> {
    const organizationKey = await this.reader.getActiveOrganizationDataKey(organizationId);
    if (organizationKey?.status !== "active") {
      throw new TenantDataKeyNotReadyError();
    }
    const active = await this.reader.getActiveProjectDataKey(organizationId, projectId);
    if (!active) {
      await this.getProjectWrappedStorageRef(
        organizationId,
        projectId,
        DEFAULT_PROJECT_DATA_KEY_VERSION,
        organizationKey.rootKeyVersion,
      );
      return;
    }
    if (!active.wrappedStorageRef) {
      await this.getProjectWrappedStorageRef(
        organizationId,
        projectId,
        active.keyVersion,
        organizationKey.rootKeyVersion,
      );
    }
  }
}
