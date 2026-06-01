import type { OrganizationId, ProjectId } from "@insecur/domain";

import type { TenantDataKeyMetadataReader } from "./data-key-metadata.js";
import { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
import {
  type ActiveDataKeyVersions,
  type DataKeyVersions,
  type TenantDataKeySource,
} from "./keyring.js";

/**
 * Resolves active data-key versions from tenant-scoped metadata rows.
 * Cross-tenant lookups fail closed when metadata is absent under the caller scope.
 */
export class MetadataTenantDataKeySource implements TenantDataKeySource {
  constructor(private readonly metadata: TenantDataKeyMetadataReader) {}

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
      organizationDataKeyVersion: organizationKey.keyVersion,
      projectDataKeyVersion: projectKey.keyVersion,
    };
  }

  async assertVersionsAvailable(
    organizationId: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<void> {
    await this.resolveVersions(organizationId, projectId, versions);
  }

  private async resolveVersions(
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
      organizationDataKeyVersion: organizationKey.keyVersion,
      projectDataKeyVersion: projectKey.keyVersion,
    };
  }
}
