import type { OrganizationId, ProjectId } from "@insecur/domain";
import { TenantDataKeyNotReadyError } from "@insecur/crypto";

import {
  updateOrganizationDataKeyWrapIfNull,
  updateProjectDataKeyWrapIfNull,
} from "./data-key-rewrap-store.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { SeedOrganizationDataKeyInput, SeedProjectDataKeyInput } from "./types.js";
import type { OrganizationDataKeyMetadata, ProjectDataKeyMetadata } from "@insecur/crypto";

interface OrganizationMintStore {
  getOrganizationDataKeyVersion(
    organizationId: OrganizationId,
    keyVersion: number,
  ): Promise<OrganizationDataKeyMetadata | null>;
  insertOrganizationDataKey(input: SeedOrganizationDataKeyInput): Promise<void>;
}

interface ProjectMintStore {
  getProjectDataKeyVersion(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: number,
  ): Promise<ProjectDataKeyMetadata | null>;
  insertProjectDataKey(input: SeedProjectDataKeyInput): Promise<void>;
}

interface OrganizationMintPersistInput {
  readonly organizationId: OrganizationId;
  readonly keyVersion: number;
  readonly rootKeyVersion: number;
  readonly wrappedStorageRef: string;
  readonly rowId: string;
}

interface ProjectMintPersistInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly keyVersion: number;
  readonly organizationDataKeyVersion: number;
  readonly wrappedStorageRef: string;
  readonly rowId: string;
}

async function readCommittedWrappedRef(
  readRow: () => Promise<{ wrappedStorageRef: string | null } | null>,
): Promise<string> {
  const committed = await readRow();
  if (!committed?.wrappedStorageRef) {
    throw new TenantDataKeyNotReadyError();
  }
  return committed.wrappedStorageRef;
}

export async function persistOrganizationDataKeyAuthoritative(
  db: TenantScopedDb,
  store: OrganizationMintStore,
  input: OrganizationMintPersistInput,
): Promise<string> {
  const existing = await store.getOrganizationDataKeyVersion(
    input.organizationId,
    input.keyVersion,
  );
  if (existing?.wrappedStorageRef) {
    return existing.wrappedStorageRef;
  }

  if (!existing) {
    await store.insertOrganizationDataKey({
      id: input.rowId,
      organizationId: input.organizationId,
      keyVersion: input.keyVersion,
      status: "active",
      rootKeyVersion: input.rootKeyVersion,
      wrappedStorageRef: input.wrappedStorageRef,
    });
  } else {
    await updateOrganizationDataKeyWrapIfNull(db, input.organizationId, input.keyVersion, {
      wrappedStorageRef: input.wrappedStorageRef,
      rootKeyVersion: input.rootKeyVersion,
      status: existing.status,
    });
  }

  return readCommittedWrappedRef(() =>
    store.getOrganizationDataKeyVersion(input.organizationId, input.keyVersion),
  );
}

export async function persistProjectDataKeyAuthoritative(
  db: TenantScopedDb,
  store: ProjectMintStore,
  input: ProjectMintPersistInput,
): Promise<string> {
  const existing = await store.getProjectDataKeyVersion(
    input.organizationId,
    input.projectId,
    input.keyVersion,
  );
  if (existing?.wrappedStorageRef) {
    return existing.wrappedStorageRef;
  }

  if (!existing) {
    await store.insertProjectDataKey({
      id: input.rowId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      keyVersion: input.keyVersion,
      organizationDataKeyVersion: input.organizationDataKeyVersion,
      status: "active",
      wrappedStorageRef: input.wrappedStorageRef,
    });
  } else {
    await updateProjectDataKeyWrapIfNull(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      keyVersion: input.keyVersion,
      wrappedStorageRef: input.wrappedStorageRef,
      organizationDataKeyVersion: input.organizationDataKeyVersion,
      status: existing.status,
    });
  }

  return readCommittedWrappedRef(() =>
    store.getProjectDataKeyVersion(input.organizationId, input.projectId, input.keyVersion),
  );
}
