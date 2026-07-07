import type { OrganizationId, ProjectId } from "@insecur/domain";
import {
  mintOrganizationDataKey,
  mintProjectDataKey,
  type ActiveDataKeyVersions,
  type DataKeyVersions,
  type KeyVersion,
  type OrganizationDataKeyVersions,
  type RootKeyProvider,
  type TenantDataKeySource,
} from "@insecur/crypto";

import {
  LOCAL_DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
  LOCAL_DEFAULT_PROJECT_DATA_KEY_VERSION,
  LOCAL_DEFAULT_ROOT_KEY_VERSION,
} from "../constants.js";
import { LOCAL_MODE_ORGANIZATION_ID } from "./local-organization.js";

interface ProjectDataKeyRow {
  readonly projectId: ProjectId;
  readonly projectDataKeyVersion: number;
  readonly rootKeyVersion: number;
  readonly wrappedStorageRef: string;
}

interface OrganizationDataKeyRow {
  readonly organizationDataKeyVersion: number;
  readonly rootKeyVersion: number;
  readonly wrappedStorageRef: string;
}

export interface LocalDataKeyPersistence {
  getOrganizationDataKey(version: KeyVersion): OrganizationDataKeyRow | null;
  saveOrganizationDataKey(row: OrganizationDataKeyRow): void;
  getProjectDataKey(projectId: ProjectId, version: KeyVersion): ProjectDataKeyRow | null;
  saveProjectDataKey(row: ProjectDataKeyRow): void;
}

/**
 * Persists wrapped organization/project data keys in the local SQLite store.
 * Uses the machine root key where hosted storage uses INSTANCE_ROOT_KEY_V1.
 */
export class PersistingLocalDataKeySource implements TenantDataKeySource {
  constructor(
    private readonly rootKeyProvider: RootKeyProvider,
    private readonly persistence: LocalDataKeyPersistence,
  ) {}

  private async ensureOrganizationDataKey(
    organizationDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    const existing = this.persistence.getOrganizationDataKey(organizationDataKeyVersion);
    if (existing) {
      return existing.wrappedStorageRef;
    }
    const wrappedStorageRef = await mintOrganizationDataKey(this.rootKeyProvider, rootKeyVersion, {
      organizationId: LOCAL_MODE_ORGANIZATION_ID,
      keyVersion: organizationDataKeyVersion,
    }).then((minted) => minted.wrappedStorageRef);
    this.persistence.saveOrganizationDataKey({
      organizationDataKeyVersion,
      rootKeyVersion,
      wrappedStorageRef,
    });
    return wrappedStorageRef;
  }

  private async ensureProjectDataKey(
    projectId: ProjectId,
    projectDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<string> {
    const existing = this.persistence.getProjectDataKey(projectId, projectDataKeyVersion);
    if (existing) {
      return existing.wrappedStorageRef;
    }
    await this.ensureOrganizationDataKey(organizationDataKeyVersion, rootKeyVersion);
    const wrappedStorageRef = await mintProjectDataKey(this.rootKeyProvider, rootKeyVersion, {
      organizationId: LOCAL_MODE_ORGANIZATION_ID,
      projectId,
      keyVersion: projectDataKeyVersion,
    }).then((minted) => minted.wrappedStorageRef);
    this.persistence.saveProjectDataKey({
      projectId,
      projectDataKeyVersion,
      rootKeyVersion,
      wrappedStorageRef,
    });
    return wrappedStorageRef;
  }

  async getActiveOrganizationVersions(
    organizationIdValue: OrganizationId,
  ): Promise<OrganizationDataKeyVersions> {
    if (organizationIdValue !== LOCAL_MODE_ORGANIZATION_ID) {
      throw new Error(
        "local data key source only supports the machine-scoped organization sentinel",
      );
    }
    const rootKeyVersion = LOCAL_DEFAULT_ROOT_KEY_VERSION;
    const organizationDataKeyVersion = LOCAL_DEFAULT_ORGANIZATION_DATA_KEY_VERSION;
    await this.ensureOrganizationDataKey(organizationDataKeyVersion, rootKeyVersion);
    return { rootKeyVersion, organizationDataKeyVersion };
  }

  async resolveOrganizationVersions(
    organizationIdValue: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyVersions> {
    if (organizationIdValue !== LOCAL_MODE_ORGANIZATION_ID) {
      throw new Error(
        "local data key source only supports the machine-scoped organization sentinel",
      );
    }
    const rootKeyVersion = LOCAL_DEFAULT_ROOT_KEY_VERSION;
    await this.ensureOrganizationDataKey(organizationDataKeyVersion, rootKeyVersion);
    return { rootKeyVersion, organizationDataKeyVersion };
  }

  async getActiveVersions(
    organizationIdValue: OrganizationId,
    projectId: ProjectId,
  ): Promise<ActiveDataKeyVersions> {
    const orgVersions = await this.getActiveOrganizationVersions(organizationIdValue);
    const projectDataKeyVersion = LOCAL_DEFAULT_PROJECT_DATA_KEY_VERSION;
    await this.ensureProjectDataKey(
      projectId,
      projectDataKeyVersion,
      orgVersions.rootKeyVersion,
      orgVersions.organizationDataKeyVersion,
    );
    return {
      organizationId: organizationIdValue,
      projectId,
      rootKeyVersion: orgVersions.rootKeyVersion,
      organizationDataKeyVersion: orgVersions.organizationDataKeyVersion,
      projectDataKeyVersion,
    };
  }

  async resolveVersions(
    organizationIdValue: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<ActiveDataKeyVersions> {
    const orgVersions = await this.resolveOrganizationVersions(
      organizationIdValue,
      versions.organizationDataKeyVersion,
    );
    await this.ensureProjectDataKey(
      projectId,
      versions.projectDataKeyVersion,
      orgVersions.rootKeyVersion,
      orgVersions.organizationDataKeyVersion,
    );
    return {
      organizationId: organizationIdValue,
      projectId,
      rootKeyVersion: orgVersions.rootKeyVersion,
      organizationDataKeyVersion: versions.organizationDataKeyVersion,
      projectDataKeyVersion: versions.projectDataKeyVersion,
    };
  }

  async getOrganizationWrappedStorageRef(
    organizationIdValue: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    if (organizationIdValue !== LOCAL_MODE_ORGANIZATION_ID) {
      throw new Error(
        "local data key source only supports the machine-scoped organization sentinel",
      );
    }
    return this.ensureOrganizationDataKey(organizationDataKeyVersion, rootKeyVersion);
  }

  async getProjectWrappedStorageRef(
    organizationIdValue: OrganizationId,
    projectId: ProjectId,
    projectDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    const orgVersions = await this.resolveOrganizationVersions(
      organizationIdValue,
      LOCAL_DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
    );
    return this.ensureProjectDataKey(
      projectId,
      projectDataKeyVersion,
      rootKeyVersion,
      orgVersions.organizationDataKeyVersion,
    );
  }
}
