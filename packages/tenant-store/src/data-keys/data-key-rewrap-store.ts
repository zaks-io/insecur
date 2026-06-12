import type { OrganizationId, ProjectId } from "@insecur/domain";
import type { OrganizationDataKeyMetadata, ProjectDataKeyMetadata } from "@insecur/crypto";
import { and, eq } from "drizzle-orm";

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

export async function updateOrganizationDataKeyWrap(
  db: TenantScopedDb,
  organizationId: OrganizationId,
  keyVersion: number,
  input: {
    readonly wrappedStorageRef: string;
    readonly rootKeyVersion: number;
    readonly status: OrganizationDataKeyMetadata["status"];
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
      and(
        eq(organizationDataKeys.orgId, organizationId),
        eq(organizationDataKeys.keyVersion, keyVersion),
      ),
    );
}

export async function updateProjectDataKeyWrap(
  db: TenantScopedDb,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly keyVersion: number;
    readonly wrappedStorageRef: string;
    readonly status: ProjectDataKeyMetadata["status"];
  },
): Promise<void> {
  await db
    .update(projectDataKeys)
    .set({
      wrappedStorageRef: input.wrappedStorageRef,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectDataKeys.orgId, input.organizationId),
        eq(projectDataKeys.projectId, input.projectId),
        eq(projectDataKeys.keyVersion, input.keyVersion),
      ),
    );
}
