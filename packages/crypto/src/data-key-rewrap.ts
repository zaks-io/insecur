import type { OrganizationId, ProjectId } from "@insecur/domain";
import type { TenantDataKeyRewrapStore } from "@insecur/custody-contracts";

import { canRetireRootKeyBinding, statusAfterRootRewrap } from "./data-key-lifecycle.js";
import type { OrganizationDataKeyMetadata, ProjectDataKeyMetadata } from "./data-key-metadata.js";
import {
  rewrapOrganizationDataKeyStorageRef,
  rewrapProjectDataKeyStorageRef,
  unwrapProjectDataKeyBytes,
  type RootRewrapVersions,
} from "./data-key-wrap.js";
import { DecryptError } from "./errors.js";
import { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
import type { KeyVersion, RootKeyProvider } from "./keyring.js";

export interface RewrapTenantDataKeysInput {
  readonly organizationId: OrganizationId;
  readonly oldRootVersion: KeyVersion;
  readonly newRootVersion: KeyVersion;
  readonly rootKeyProvider: RootKeyProvider;
  readonly store: TenantDataKeyRewrapStore;
}

function assertWrappedRef(wrappedStorageRef: string | null): asserts wrappedStorageRef is string {
  if (!wrappedStorageRef) {
    throw new TenantDataKeyNotReadyError();
  }
}

interface ProjectRewrapProbeInput {
  readonly rootKeyProvider: RootKeyProvider;
  readonly wrappedStorageRef: string;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly keyVersion: KeyVersion;
  readonly versions: RootRewrapVersions;
}

async function projectKeyNeedsRewrap(input: ProjectRewrapProbeInput): Promise<boolean> {
  const identity = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    keyVersion: input.keyVersion,
  };
  const oldRootBytes = await input.rootKeyProvider.getRootKeyBytes(input.versions.oldRootVersion);
  try {
    await unwrapProjectDataKeyBytes(oldRootBytes, input.wrappedStorageRef, identity);
    return true;
  } catch (error) {
    if (!(error instanceof DecryptError)) {
      throw error;
    }
  }

  const newRootBytes = await input.rootKeyProvider.getRootKeyBytes(input.versions.newRootVersion);
  try {
    await unwrapProjectDataKeyBytes(newRootBytes, input.wrappedStorageRef, identity);
    return false;
  } catch (error) {
    if (error instanceof DecryptError) {
      throw new TenantDataKeyNotReadyError();
    }
    throw error;
  }
}

async function rewrapOrganizationKeys(
  input: RewrapTenantDataKeysInput,
  organizationKeys: readonly OrganizationDataKeyMetadata[],
  versions: RootRewrapVersions,
): Promise<void> {
  for (const organizationKey of organizationKeys) {
    if (organizationKey.rootKeyVersion !== input.oldRootVersion) {
      continue;
    }
    assertWrappedRef(organizationKey.wrappedStorageRef);
    const wrappedStorageRef = await rewrapOrganizationDataKeyStorageRef(
      input.rootKeyProvider,
      organizationKey.wrappedStorageRef,
      {
        organizationId: input.organizationId,
        keyVersion: organizationKey.keyVersion,
      },
      versions,
    );
    await input.store.updateOrganizationDataKeyWrap(
      input.organizationId,
      organizationKey.keyVersion,
      {
        wrappedStorageRef,
        rootKeyVersion: input.newRootVersion,
        status: statusAfterRootRewrap(organizationKey.status),
      },
    );
  }
}

async function rewrapProjectKeys(
  input: RewrapTenantDataKeysInput,
  projectKeys: readonly ProjectDataKeyMetadata[],
  versions: RootRewrapVersions,
): Promise<void> {
  for (const projectKey of projectKeys) {
    assertWrappedRef(projectKey.wrappedStorageRef);
    const needsRewrap = await projectKeyNeedsRewrap({
      rootKeyProvider: input.rootKeyProvider,
      wrappedStorageRef: projectKey.wrappedStorageRef,
      organizationId: input.organizationId,
      projectId: projectKey.projectId,
      keyVersion: projectKey.keyVersion,
      versions,
    });
    if (!needsRewrap) {
      continue;
    }
    const wrappedStorageRef = await rewrapProjectDataKeyStorageRef(
      input.rootKeyProvider,
      projectKey.wrappedStorageRef,
      {
        organizationId: input.organizationId,
        projectId: projectKey.projectId,
        keyVersion: projectKey.keyVersion,
      },
      versions,
    );
    await input.store.updateProjectDataKeyWrap(
      input.organizationId,
      projectKey.projectId,
      projectKey.keyVersion,
      {
        wrappedStorageRef,
        status: statusAfterRootRewrap(projectKey.status),
      },
    );
  }
}

/** Rewraps organization and project data keys under a new root version without touching record ciphertext. */
export async function rewrapTenantDataKeys(input: RewrapTenantDataKeysInput): Promise<void> {
  const versions = {
    oldRootVersion: input.oldRootVersion,
    newRootVersion: input.newRootVersion,
  };
  const organizationKeys = await input.store.listOrganizationDataKeys(input.organizationId);
  const projectKeys = await input.store.listProjectDataKeys(input.organizationId);

  // Rewrap project keys before flipping org root_key_version. If rewrap fails mid-flight,
  // readers may see project blobs under the new root while org rows still cite the old root
  // (DecryptError until retry); the ordering avoids the worse case of new root + stale wraps.
  await rewrapProjectKeys(input, projectKeys, versions);
  await rewrapOrganizationKeys(input, organizationKeys, versions);

  const updatedOrganizationKeys = await input.store.listOrganizationDataKeys(input.organizationId);
  if (!canRetireRootKeyBinding(updatedOrganizationKeys, input.oldRootVersion)) {
    throw new TenantDataKeyNotReadyError();
  }
}

export { canRetireRootKeyBinding };
