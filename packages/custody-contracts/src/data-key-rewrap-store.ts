import type { OrganizationId, ProjectId } from "@insecur/domain";

import type {
  KeyVersion,
  OrganizationDataKeyMetadata,
  ProjectDataKeyMetadata,
} from "./data-key-metadata.js";

export interface TenantDataKeyRewrapStore {
  listOrganizationDataKeys(organizationId: OrganizationId): Promise<OrganizationDataKeyMetadata[]>;

  listProjectDataKeys(organizationId: OrganizationId): Promise<ProjectDataKeyMetadata[]>;

  updateOrganizationDataKeyWrap(
    organizationId: OrganizationId,
    keyVersion: KeyVersion,
    input: {
      readonly wrappedStorageRef: string;
      readonly rootKeyVersion: KeyVersion;
      readonly status: OrganizationDataKeyMetadata["status"];
    },
  ): Promise<void>;

  updateProjectDataKeyWrap(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: KeyVersion,
    input: {
      readonly wrappedStorageRef: string;
      readonly status: ProjectDataKeyMetadata["status"];
    },
  ): Promise<void>;
}
