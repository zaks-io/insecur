import type { OrganizationId, ProjectId } from "@insecur/domain";

import { toBufferSource } from "./buffer.js";
import {
  DATA_KEY_LENGTH,
  DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
  DEFAULT_PROJECT_DATA_KEY_VERSION,
  DEFAULT_ROOT_KEY_VERSION,
} from "./constants.js";

export type KeyVersion = number;

export interface RootKeyProvider {
  getRootKeyBytes(version: KeyVersion): Promise<Uint8Array>;
}

export interface DataKeyVersions {
  organizationDataKeyVersion: KeyVersion;
  projectDataKeyVersion: KeyVersion;
}

export interface ActiveDataKeyVersions extends DataKeyVersions {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly rootKeyVersion: KeyVersion;
}

/**
 * Resolves wrapped organization and project data keys from tenant-scoped storage.
 * First Value uses an in-memory or derived implementation until metadata rows carry material.
 */
export interface TenantDataKeySource {
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
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== DATA_KEY_LENGTH) {
    throw new Error("invalid data key length");
  }
  return crypto.subtle.importKey("raw", toBufferSource(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveKeyMaterial(
  parent: Uint8Array,
  salt: string,
  info: string,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", toBufferSource(parent), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      info: new TextEncoder().encode(info),
    },
    baseKey,
    DATA_KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

/** Development and test keyring: derives tenant keys from a root without exposing them to callers. */
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

    const rootBytes = await this.rootKeyProvider.getRootKeyBytes(resolved.rootKeyVersion);
    const orgBytes = await deriveKeyMaterial(
      rootBytes,
      organizationId,
      `insecur:organization-data-key:v${String(resolved.organizationDataKeyVersion)}`,
    );
    const projectBytes = await deriveKeyMaterial(
      orgBytes,
      projectId,
      `insecur:project-data-key:v${String(resolved.projectDataKeyVersion)}`,
    );
    const projectKey = await importAesKey(projectBytes);
    this.cache.set(cacheKey, projectKey);
    return projectKey;
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

export class DefaultTenantDataKeySource implements TenantDataKeySource {
  getActiveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<ActiveDataKeyVersions> {
    return Promise.resolve({
      organizationId,
      projectId,
      rootKeyVersion: DEFAULT_ROOT_KEY_VERSION,
      organizationDataKeyVersion: DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
      projectDataKeyVersion: DEFAULT_PROJECT_DATA_KEY_VERSION,
    });
  }

  resolveVersions(
    organizationId: OrganizationId,
    projectId: ProjectId,
    versions: DataKeyVersions,
  ): Promise<ActiveDataKeyVersions> {
    return Promise.resolve({
      organizationId,
      projectId,
      rootKeyVersion: DEFAULT_ROOT_KEY_VERSION,
      organizationDataKeyVersion: versions.organizationDataKeyVersion,
      projectDataKeyVersion: versions.projectDataKeyVersion,
    });
  }
}

export function createKeyring(rootKeyBytes: Uint8Array): Keyring {
  return new Keyring(new StaticRootKeyProvider(rootKeyBytes), new DefaultTenantDataKeySource());
}
