import { organizationId, projectId, type OrganizationId, type ProjectId } from "@insecur/domain";
import { and, desc, eq } from "drizzle-orm";

import { organizationDataKeys, projectDataKeys } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  type DataKeyVersionStatus,
  type OrganizationDataKeyRow,
  type ProjectDataKeyRow,
  type SeedOrganizationDataKeyInput,
  type SeedProjectDataKeyInput,
} from "./types.js";

function parseStatus(raw: string): DataKeyVersionStatus {
  if (raw === "active" || raw === "retired" || raw === "revoked") {
    return raw;
  }
  throw new Error("invalid data key status in store");
}

function toOrganizationMetadata(row: OrganizationDataKeyRow) {
  return {
    id: row.id,
    organizationId: organizationId.brand(row.org_id),
    keyVersion: row.key_version,
    status: parseStatus(row.status),
    rootKeyVersion: row.root_key_version,
    wrappedStorageRef: row.wrapped_storage_ref,
    custodyEvidenceRef: row.custody_evidence_ref,
  };
}

function toProjectMetadata(row: ProjectDataKeyRow) {
  return {
    id: row.id,
    organizationId: organizationId.brand(row.org_id),
    projectId: projectId.brand(row.project_id),
    keyVersion: row.key_version,
    status: parseStatus(row.status),
    organizationDataKeyVersion: row.organization_data_key_version,
    wrappedStorageRef: row.wrapped_storage_ref,
  };
}

const organizationDataKeySelect = {
  id: organizationDataKeys.id,
  org_id: organizationDataKeys.orgId,
  key_version: organizationDataKeys.keyVersion,
  status: organizationDataKeys.status,
  root_key_version: organizationDataKeys.rootKeyVersion,
  wrapped_storage_ref: organizationDataKeys.wrappedStorageRef,
  custody_evidence_ref: organizationDataKeys.custodyEvidenceRef,
  created_at: organizationDataKeys.createdAt,
  updated_at: organizationDataKeys.updatedAt,
} as const;

const projectDataKeySelect = {
  id: projectDataKeys.id,
  org_id: projectDataKeys.orgId,
  project_id: projectDataKeys.projectId,
  key_version: projectDataKeys.keyVersion,
  status: projectDataKeys.status,
  organization_data_key_version: projectDataKeys.organizationDataKeyVersion,
  wrapped_storage_ref: projectDataKeys.wrappedStorageRef,
  created_at: projectDataKeys.createdAt,
  updated_at: projectDataKeys.updatedAt,
} as const;

/** Tenant-scoped reads and writes for organization and project data key metadata. */
export class TenantDataKeyMetadataStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getOrganizationDataKeyForReadiness(organizationId: OrganizationId) {
    const active = await this.getActiveOrganizationDataKey(organizationId);
    if (active) {
      return active;
    }
    return this.getLatestOrganizationDataKey(organizationId);
  }

  async getProjectDataKeyForReadiness(organizationId: OrganizationId, projectId: ProjectId) {
    const active = await this.getActiveProjectDataKey(organizationId, projectId);
    if (active) {
      return active;
    }
    return this.getLatestProjectDataKey(organizationId, projectId);
  }

  async getActiveOrganizationDataKey(organizationId: OrganizationId) {
    const rows = await this.db
      .select(organizationDataKeySelect)
      .from(organizationDataKeys)
      .where(
        and(
          eq(organizationDataKeys.orgId, organizationId),
          eq(organizationDataKeys.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toOrganizationMetadata(row as OrganizationDataKeyRow) : null;
  }

  async getOrganizationDataKeyVersion(organizationId: OrganizationId, keyVersion: number) {
    const rows = await this.db
      .select(organizationDataKeySelect)
      .from(organizationDataKeys)
      .where(
        and(
          eq(organizationDataKeys.orgId, organizationId),
          eq(organizationDataKeys.keyVersion, keyVersion),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toOrganizationMetadata(row as OrganizationDataKeyRow) : null;
  }

  async getActiveProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    const rows = await this.db
      .select(projectDataKeySelect)
      .from(projectDataKeys)
      .where(
        and(
          eq(projectDataKeys.orgId, organizationId),
          eq(projectDataKeys.projectId, projectId),
          eq(projectDataKeys.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProjectMetadata(row as ProjectDataKeyRow) : null;
  }

  async getProjectDataKeyVersion(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: number,
  ) {
    const rows = await this.db
      .select(projectDataKeySelect)
      .from(projectDataKeys)
      .where(
        and(
          eq(projectDataKeys.orgId, organizationId),
          eq(projectDataKeys.projectId, projectId),
          eq(projectDataKeys.keyVersion, keyVersion),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProjectMetadata(row as ProjectDataKeyRow) : null;
  }

  private async getLatestOrganizationDataKey(organizationId: OrganizationId) {
    const rows = await this.db
      .select(organizationDataKeySelect)
      .from(organizationDataKeys)
      .where(eq(organizationDataKeys.orgId, organizationId))
      .orderBy(desc(organizationDataKeys.keyVersion))
      .limit(1);
    const row = rows[0];
    return row ? toOrganizationMetadata(row as OrganizationDataKeyRow) : null;
  }

  private async getLatestProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    const rows = await this.db
      .select(projectDataKeySelect)
      .from(projectDataKeys)
      .where(
        and(eq(projectDataKeys.orgId, organizationId), eq(projectDataKeys.projectId, projectId)),
      )
      .orderBy(desc(projectDataKeys.keyVersion))
      .limit(1);
    const row = rows[0];
    return row ? toProjectMetadata(row as ProjectDataKeyRow) : null;
  }

  async insertOrganizationDataKey(input: SeedOrganizationDataKeyInput): Promise<void> {
    await this.db
      .insert(organizationDataKeys)
      .values({
        id: input.id,
        orgId: input.organizationId,
        keyVersion: input.keyVersion,
        status: input.status ?? "active",
        rootKeyVersion: input.rootKeyVersion ?? 1,
        wrappedStorageRef: input.wrappedStorageRef ?? null,
        custodyEvidenceRef: input.custodyEvidenceRef ?? null,
      })
      .onConflictDoNothing({
        target: [organizationDataKeys.orgId, organizationDataKeys.keyVersion],
      });
  }

  async insertProjectDataKey(input: SeedProjectDataKeyInput): Promise<void> {
    await this.db
      .insert(projectDataKeys)
      .values({
        id: input.id,
        orgId: input.organizationId,
        projectId: input.projectId,
        keyVersion: input.keyVersion,
        status: input.status ?? "active",
        organizationDataKeyVersion: input.organizationDataKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef ?? null,
      })
      .onConflictDoNothing({
        target: [projectDataKeys.projectId, projectDataKeys.keyVersion],
      });
  }
}
