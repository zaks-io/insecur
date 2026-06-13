import type { OrganizationId, ProjectId } from "@insecur/domain";

import type { TenantDataKeyMetadataReader } from "./data-key-metadata.js";
import { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
import {
  type ActiveDataKeyVersions,
  type DataKeyVersions,
  type KeyVersion,
  type OrganizationDataKeyVersions,
  type TenantDataKeySource,
} from "./keyring.js";

/**
 * Resolves active data-key versions from tenant-scoped metadata rows.
 * Cross-tenant lookups fail closed when metadata is absent under the caller scope.
 */
export class MetadataTenantDataKeySource implements TenantDataKeySource {
  constructor(private readonly metadata: TenantDataKeyMetadataReader) {}

  async getActiveOrganizationVersions(
    organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyVersions> {
    const organizationKey = await this.metadata.getActiveOrganizationDataKey(organizationId);
    if (organizationKey?.status !== "active") {
      throw new TenantDataKeyNotReadyError();
    }
    return {
      rootKeyVersion: organizationKey.rootKeyVersion,
      organizationDataKeyVersion: organizationKey.keyVersion,
    };
  }

  async resolveOrganizationVersions(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyVersions> {
    const organizationKey = await this.metadata.getOrganizationDataKeyVersion(
      organizationId,
      organizationDataKeyVersion,
    );
    if (!organizationKey) {
      throw new TenantDataKeyNotReadyError();
    }
    return {
      rootKeyVersion: organizationKey.rootKeyVersion,
      organizationDataKeyVersion: organizationKey.keyVersion,
    };
  }

  async getActiveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ActiveDataKeyVersions> {
    const organizationKey = await this.metadata.getActiveOrganizationDataKey(organizationId);
    const projectKey = await this.metadata.getActiveProjectDataKey(organizationId, projectId);

    if (!organizationKey || !projectKey) {
      throw new TenantDataKeyNotReadyError();
    }
    if (organizationKey.status !== "active" || projectKey.status !== "active") {
      throw new TenantDataKeyNotReadyError();
    }
    if (projectKey.organizationDataKeyVersion !== organizationKey.keyVersion) {
      throw new TenantDataKeyNotReadyError();
    }

    return {
      organizationId,
      projectId,
      rootKeyVersion: organizationKey.rootKeyVersion,
      organizationDataKeyVersion: organizationKey.keyVersion,
      projectDataKeyVersion: projectKey.keyVersion,
    };
  }

  async resolveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<ActiveDataKeyVersions> {
    const organizationKey = await this.metadata.getOrganizationDataKeyVersion(
      organizationId,
      versions.organizationDataKeyVersion,
    );
    const projectKey = await this.metadata.getProjectDataKeyVersion(
      organizationId,
      projectId,
      versions.projectDataKeyVersion,
    );

    if (!organizationKey || !projectKey) {
      throw new TenantDataKeyNotReadyError();
    }
    if (projectKey.organizationDataKeyVersion !== organizationKey.keyVersion) {
      throw new TenantDataKeyNotReadyError();
    }

    return {
      organizationId,
      projectId,
      rootKeyVersion: organizationKey.rootKeyVersion,
      organizationDataKeyVersion: organizationKey.keyVersion,
      projectDataKeyVersion: projectKey.keyVersion,
    };
  }

  async getOrganizationWrappedStorageRef(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
    _rootKeyVersion: KeyVersion,
  ): Promise<string> {
    void _rootKeyVersion;
    const organizationKey = await this.metadata.getOrganizationDataKeyVersion(
      organizationId,
      organizationDataKeyVersion,
    );
    if (!organizationKey?.wrappedStorageRef) {
      throw new TenantDataKeyNotReadyError();
    }
    return organizationKey.wrappedStorageRef;
  }

  async getProjectWrappedStorageRef(
    organizationId: OrganizationId,
    projectId: ProjectId,
    projectDataKeyVersion: KeyVersion,
    _rootKeyVersion: KeyVersion,
  ): Promise<string> {
    void _rootKeyVersion;
    const projectKey = await this.metadata.getProjectDataKeyVersion(
      organizationId,
      projectId,
      projectDataKeyVersion,
    );
    if (!projectKey?.wrappedStorageRef) {
      throw new TenantDataKeyNotReadyError();
    }
    return projectKey.wrappedStorageRef;
  }
}
