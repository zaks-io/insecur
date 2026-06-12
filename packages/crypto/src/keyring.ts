import type { OrganizationId, ProjectId } from "@insecur/domain";

import type { RewrapTenantDataKeysInput, TenantDataKeyRewrapStore } from "./data-key-rewrap.js";
import { rewrapTenantDataKeys } from "./data-key-rewrap.js";
import {
  unwrapOrganizationDataKey,
  unwrapProjectDataKey,
  WrappedDefaultTenantDataKeySource,
} from "./keyring-unwrap.js";

export {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  unwrapOrganizationDataKey,
  unwrapProjectDataKey,
  WrappedDefaultTenantDataKeySource,
} from "./keyring-unwrap.js";

export type KeyVersion = number;

export interface RootKeyProvider {
  getRootKeyBytes(version: KeyVersion): Promise<Uint8Array>;
}

export interface DataKeyVersions {
  organizationDataKeyVersion: KeyVersion;
  projectDataKeyVersion: KeyVersion;
}

export interface OrganizationDataKeyVersions {
  rootKeyVersion: KeyVersion;
  organizationDataKeyVersion: KeyVersion;
}

export interface ActiveDataKeyVersions extends DataKeyVersions {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly rootKeyVersion: KeyVersion;
}

/**
 * Resolves wrapped organization and project data keys from tenant-scoped storage.
 * Production reads unwrap inline blobs from `wrapped_storage_ref`.
 */
export interface TenantDataKeySource {
  getActiveOrganizationVersions(
    organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyVersions>;

  resolveOrganizationVersions(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyVersions>;

  getActiveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ActiveDataKeyVersions>;

  /** Resolves metadata for the requested versions, including the wrapping root key version. */
  resolveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<ActiveDataKeyVersions>;

  getOrganizationWrappedStorageRef(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string>;

  getProjectWrappedStorageRef(
    organizationId: OrganizationId,
    projectId: ProjectId,
    projectDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string>;
}

/** Unwraps tenant data keys from root-wrapped blobs stored in tenant-scoped metadata. */
export class Keyring {
  private readonly cache = new Map<string, CryptoKey>();

  constructor(
    private readonly rootKeyProvider: RootKeyProvider,
    private readonly dataKeySource: TenantDataKeySource,
  ) {}

  async getActiveDataKeyVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ActiveDataKeyVersions> {
    return this.dataKeySource.getActiveVersions(organizationId, projectId);
  }

  async getActiveOrganizationDataKeyVersions(
    organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyVersions> {
    return this.dataKeySource.getActiveOrganizationVersions(organizationId);
  }

  async resolveOrganizationDataKeyVersions(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyVersions> {
    return this.dataKeySource.resolveOrganizationVersions(
      organizationId,
      organizationDataKeyVersion,
    );
  }

  async getOrganizationDataKey(
    organizationId: OrganizationId,
    versions: OrganizationDataKeyVersions,
  ): Promise<CryptoKey> {
    const cacheKey = [
      "org",
      organizationId,
      versions.rootKeyVersion,
      versions.organizationDataKeyVersion,
    ].join(":");
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const organizationKey = await unwrapOrganizationDataKey(
      this.rootKeyProvider,
      this.dataKeySource,
      organizationId,
      versions,
    );
    this.cache.set(cacheKey, organizationKey);
    return organizationKey;
  }

  async getProjectDataKey(
    organizationId: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<CryptoKey> {
    const resolved = await this.dataKeySource.resolveVersions(organizationId, projectId, versions);

    const cacheKey = [
      organizationId,
      projectId,
      resolved.rootKeyVersion,
      resolved.organizationDataKeyVersion,
      resolved.projectDataKeyVersion,
    ].join(":");
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const projectKey = await unwrapProjectDataKey({
      rootKeyProvider: this.rootKeyProvider,
      dataKeySource: this.dataKeySource,
      organizationId,
      projectId,
      resolved,
      projectDataKeyVersion: resolved.projectDataKeyVersion,
    });
    this.cache.set(cacheKey, projectKey);
    return projectKey;
  }

  async rewrapTenantDataKeys(
    input: Omit<RewrapTenantDataKeysInput, "rootKeyProvider" | "store"> & {
      readonly store: TenantDataKeyRewrapStore;
    },
  ): Promise<void> {
    await rewrapTenantDataKeys({
      ...input,
      rootKeyProvider: this.rootKeyProvider,
    });
  }

  clearCacheForTests(): void {
    this.cache.clear();
  }
}

export class StaticRootKeyProvider implements RootKeyProvider {
  constructor(private readonly rootKeyBytes: Uint8Array) {}

  getRootKeyBytes(_version: KeyVersion): Promise<Uint8Array> {
    void _version;
    return Promise.resolve(this.rootKeyBytes);
  }
}

/** Test-only keyring using in-memory wrapped DEK minting; production uses `createTenantBackedKeyring`. */
export function createKeyring(rootKeyBytes: Uint8Array): Keyring {
  const rootKeyProvider = new StaticRootKeyProvider(rootKeyBytes);
  return new Keyring(rootKeyProvider, new WrappedDefaultTenantDataKeySource(rootKeyProvider));
}

export type { TenantDataKeyRewrapStore };
