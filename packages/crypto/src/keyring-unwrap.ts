import type { OrganizationId, ProjectId } from "@insecur/domain";

import {
  mintOrganizationDataKey,
  mintProjectDataKey,
  unwrapOrganizationDataKeyBytes,
  unwrapProjectDataKeyBytes,
} from "./data-key-wrap.js";
import { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
import {
  DATA_KEY_LENGTH,
  DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
  DEFAULT_PROJECT_DATA_KEY_VERSION,
  DEFAULT_ROOT_KEY_VERSION,
} from "./constants.js";
import { toBufferSource } from "./buffer.js";
import type {
  ActiveDataKeyVersions,
  DataKeyVersions,
  KeyVersion,
  OrganizationDataKeyVersions,
  RootKeyProvider,
  TenantDataKeySource,
} from "./keyring.js";

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== DATA_KEY_LENGTH) {
    throw new Error("invalid data key length");
  }
  return crypto.subtle.importKey("raw", toBufferSource(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function assertWrappedRef(wrappedStorageRef: string | null): asserts wrappedStorageRef is string {
  if (!wrappedStorageRef) {
    throw new TenantDataKeyNotReadyError();
  }
}

const globalOrganizationWrappedRefs = new Map<string, string>();
const globalProjectWrappedRefs = new Map<string, string>();

export function clearWrappedDefaultTenantDataKeySourceCacheForTests(): void {
  globalOrganizationWrappedRefs.clear();
  globalProjectWrappedRefs.clear();
}

async function rootCachePrefix(
  rootKeyProvider: RootKeyProvider,
  rootKeyVersion: KeyVersion,
): Promise<string> {
  const rootBytes = await rootKeyProvider.getRootKeyBytes(rootKeyVersion);
  const digest = await crypto.subtle.digest("SHA-256", toBufferSource(rootBytes));
  const digestHex = Buffer.from(new Uint8Array(digest)).toString("hex");
  return `${digestHex}:v${String(rootKeyVersion)}`;
}

/** Dev/test source that mints wrapped data keys in memory under the configured root provider. */
export class WrappedDefaultTenantDataKeySource implements TenantDataKeySource {
  constructor(private readonly rootKeyProvider: RootKeyProvider) {}

  private async organizationRefKey(
    rootKeyVersion: KeyVersion,
    organizationId: OrganizationId,
    keyVersion: KeyVersion,
  ): Promise<string> {
    const prefix = await rootCachePrefix(this.rootKeyProvider, rootKeyVersion);
    return `${prefix}:org:${organizationId}:${String(keyVersion)}`;
  }

  private async projectRefKey(
    rootKeyVersion: KeyVersion,
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: KeyVersion,
  ): Promise<string> {
    const prefix = await rootCachePrefix(this.rootKeyProvider, rootKeyVersion);
    return `${prefix}:prj:${organizationId}:${projectId}:${String(keyVersion)}`;
  }

  async getOrganizationWrappedStorageRef(
    organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    const cacheKey = await this.organizationRefKey(
      rootKeyVersion,
      organizationId,
      organizationDataKeyVersion,
    );
    const cached = globalOrganizationWrappedRefs.get(cacheKey);
    if (cached) {
      return cached;
    }
    const minted = await mintOrganizationDataKey(this.rootKeyProvider, rootKeyVersion, {
      organizationId,
      keyVersion: organizationDataKeyVersion,
    });
    globalOrganizationWrappedRefs.set(cacheKey, minted.wrappedStorageRef);
    return minted.wrappedStorageRef;
  }

  async getProjectWrappedStorageRef(
    organizationId: OrganizationId,
    projectId: ProjectId,
    projectDataKeyVersion: KeyVersion,
    rootKeyVersion: KeyVersion,
  ): Promise<string> {
    const cacheKey = await this.projectRefKey(
      rootKeyVersion,
      organizationId,
      projectId,
      projectDataKeyVersion,
    );
    const cached = globalProjectWrappedRefs.get(cacheKey);
    if (cached) {
      return cached;
    }
    const minted = await mintProjectDataKey(this.rootKeyProvider, rootKeyVersion, {
      organizationId,
      projectId,
      keyVersion: projectDataKeyVersion,
    });
    globalProjectWrappedRefs.set(cacheKey, minted.wrappedStorageRef);
    return minted.wrappedStorageRef;
  }

  getActiveOrganizationVersions(
    _organizationId: OrganizationId,
  ): Promise<OrganizationDataKeyVersions> {
    void _organizationId;
    return Promise.resolve({
      rootKeyVersion: DEFAULT_ROOT_KEY_VERSION,
      organizationDataKeyVersion: DEFAULT_ORGANIZATION_DATA_KEY_VERSION,
    });
  }

  resolveOrganizationVersions(
    _organizationId: OrganizationId,
    organizationDataKeyVersion: KeyVersion,
  ): Promise<OrganizationDataKeyVersions> {
    void _organizationId;
    return Promise.resolve({
      rootKeyVersion: DEFAULT_ROOT_KEY_VERSION,
      organizationDataKeyVersion,
    });
  }

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

export async function unwrapOrganizationDataKey(
  rootKeyProvider: RootKeyProvider,
  dataKeySource: TenantDataKeySource,
  organizationId: OrganizationId,
  versions: OrganizationDataKeyVersions,
): Promise<CryptoKey> {
  const wrappedStorageRef = await dataKeySource.getOrganizationWrappedStorageRef(
    organizationId,
    versions.organizationDataKeyVersion,
    versions.rootKeyVersion,
  );
  assertWrappedRef(wrappedStorageRef);
  const rootBytes = await rootKeyProvider.getRootKeyBytes(versions.rootKeyVersion);
  const orgBytes = await unwrapOrganizationDataKeyBytes(rootBytes, wrappedStorageRef, {
    organizationId,
    keyVersion: versions.organizationDataKeyVersion,
  });
  return importAesKey(orgBytes);
}

export interface UnwrapProjectDataKeyInput {
  readonly rootKeyProvider: RootKeyProvider;
  readonly dataKeySource: TenantDataKeySource;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly resolved: ActiveDataKeyVersions;
  readonly projectDataKeyVersion: KeyVersion;
}

export async function unwrapProjectDataKey(input: UnwrapProjectDataKeyInput): Promise<CryptoKey> {
  const wrappedStorageRef = await input.dataKeySource.getProjectWrappedStorageRef(
    input.organizationId,
    input.projectId,
    input.projectDataKeyVersion,
    input.resolved.rootKeyVersion,
  );
  assertWrappedRef(wrappedStorageRef);
  const rootBytes = await input.rootKeyProvider.getRootKeyBytes(input.resolved.rootKeyVersion);
  const projectBytes = await unwrapProjectDataKeyBytes(rootBytes, wrappedStorageRef, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    keyVersion: input.projectDataKeyVersion,
  });
  return importAesKey(projectBytes);
}
