import type { OrganizationId, ProjectId } from "@insecur/domain";

import type { DataKeyVersionStatus } from "./data-key-lifecycle.js";
import type { KeyVersion } from "./keyring.js";

/** Metadata for one organization data key version (no key material). */
export interface OrganizationDataKeyMetadata {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly keyVersion: KeyVersion;
  readonly status: DataKeyVersionStatus;
  readonly rootKeyVersion: KeyVersion;
  readonly wrappedStorageRef: string | null;
  readonly custodyEvidenceRef: string | null;
}

/** Metadata for one project data key version (no key material). */
export interface ProjectDataKeyMetadata {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly keyVersion: KeyVersion;
  readonly status: DataKeyVersionStatus;
  readonly organizationDataKeyVersion: KeyVersion;
  readonly wrappedStorageRef: string | null;
}

/** Tenant-scoped metadata reads for data keys; implementations must enforce organization scope. */
export interface TenantDataKeyMetadataReader {
  getActiveOrganizationDataKey(
    organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyMetadata | null>;

  getOrganizationDataKeyVersion(
    organizationId: OrganizationId,
    keyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyMetadata | null>;

  getActiveProjectDataKey(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ProjectDataKeyMetadata | null>;

  getProjectDataKeyVersion(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: KeyVersion,
  ): Promise<ProjectDataKeyMetadata | null>;

  /**
   * Returns the organization data key row used for delivery readiness checks.
   * Prefer active rows; otherwise the highest key_version regardless of status.
   */
  getOrganizationDataKeyForReadiness(
    organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyMetadata | null>;

  /**
   * Returns the project data key row used for delivery readiness checks.
   * Prefer active rows; otherwise the highest key_version regardless of status.
   */
  getProjectDataKeyForReadiness(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ProjectDataKeyMetadata | null>;
}
