import type { OrganizationId, ProjectId } from "@insecur/domain";
import type {
  OrganizationDataKeyMetadata,
  ProjectDataKeyMetadata,
} from "@insecur/custody-contracts";
import { and, eq, isNull } from "drizzle-orm";

import { organizationDataKeys, projectDataKeys } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  organizationDataKeySelect,
  projectDataKeySelect,
  toOrganizationMetadata,
  toProjectMetadata,
} from "./data-key-store-mappers.js";

export async function listOrganizationDataKeys(db: TenantScopedDb, organizationId: OrganizationId) {
  const rows = await db
    .select(organizationDataKeySelect)
    .from(organizationDataKeys)
    .where(eq(organizationDataKeys.orgId, organizationId));
  return rows.map((row) => toOrganizationMetadata(row));
}

export async function listProjectDataKeys(db: TenantScopedDb, organizationId: OrganizationId) {
  const rows = await db
    .select(projectDataKeySelect)
    .from(projectDataKeys)
    .where(eq(projectDataKeys.orgId, organizationId));
  return rows.map((row) => toProjectMetadata(row));
}

function organizationKeyVersionWhere(
  organizationId: OrganizationId,
  keyVersion: number,
  onlyIfWrappedRefNull: boolean,
) {
  const predicates = [
    eq(organizationDataKeys.orgId, organizationId),
    eq(organizationDataKeys.keyVersion, keyVersion),
    ...(onlyIfWrappedRefNull ? [isNull(organizationDataKeys.wrappedStorageRef)] : []),
  ];
  return and(...predicates);
}

function projectKeyVersionWhere(
  organizationId: OrganizationId,
  projectId: ProjectId,
  keyVersion: number,
  onlyIfWrappedRefNull: boolean,
) {
  const predicates = [
    eq(projectDataKeys.orgId, organizationId),
    eq(projectDataKeys.projectId, projectId),
    eq(projectDataKeys.keyVersion, keyVersion),
    ...(onlyIfWrappedRefNull ? [isNull(projectDataKeys.wrappedStorageRef)] : []),
  ];
  return and(...predicates);
}

export async function updateOrganizationDataKeyWrap(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly keyVersion: number;
    readonly wrappedStorageRef: string;
    readonly rootKeyVersion: number;
    readonly status: OrganizationDataKeyMetadata["status"];
    readonly onlyIfWrappedRefNull?: boolean;
  },
): Promise<void> {
  await db
    .update(organizationDataKeys)
    .set({
      wrappedStorageRef: input.wrappedStorageRef,
      rootKeyVersion: input.rootKeyVersion,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      organizationKeyVersionWhere(
        input.organizationId,
        input.keyVersion,
        input.onlyIfWrappedRefNull ?? false,
      ),
    );
}

export async function updateOrganizationDataKeyWrapIfNull(
  db: TenantScopedDb,
  organizationId: OrganizationId,
  keyVersion: number,
  input: {
    readonly wrappedStorageRef: string;
    readonly rootKeyVersion: number;
    readonly status: OrganizationDataKeyMetadata["status"];
  },
): Promise<void> {
  return updateOrganizationDataKeyWrap(db, {
    organizationId,
    keyVersion,
    ...input,
    onlyIfWrappedRefNull: true,
  });
}

export async function updateProjectDataKeyWrap(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly keyVersion: number;
    readonly wrappedStorageRef: string;
    readonly status: ProjectDataKeyMetadata["status"];
    readonly organizationDataKeyVersion?: number;
    readonly onlyIfWrappedRefNull?: boolean;
  },
): Promise<void> {
  await db
    .update(projectDataKeys)
    .set({
      wrappedStorageRef: input.wrappedStorageRef,
      ...(input.organizationDataKeyVersion !== undefined
        ? { organizationDataKeyVersion: input.organizationDataKeyVersion }
        : {}),
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      projectKeyVersionWhere(
        input.organizationId,
        input.projectId,
        input.keyVersion,
        input.onlyIfWrappedRefNull ?? false,
      ),
    );
}

export async function updateProjectDataKeyWrapIfNull(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly keyVersion: number;
    readonly wrappedStorageRef: string;
    readonly organizationDataKeyVersion: number;
    readonly status: ProjectDataKeyMetadata["status"];
  },
): Promise<void> {
  return updateProjectDataKeyWrap(db, { ...input, onlyIfWrappedRefNull: true });
}
