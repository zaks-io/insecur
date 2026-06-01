import { organizationId, projectId, type OrganizationId, type ProjectId } from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
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

/** Tenant-scoped reads and writes for organization and project data key metadata. */
export class TenantDataKeyMetadataStore {
  constructor(private readonly sql: TenantScopedSql) {}

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
    const rows = await this.sql<OrganizationDataKeyRow[]>`
      SELECT
        id,
        org_id,
        key_version,
        status,
        root_key_version,
        wrapped_storage_ref,
        custody_evidence_ref,
        created_at,
        updated_at
      FROM organization_data_keys
      WHERE org_id = ${organizationId}
        AND status = ${"active"}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toOrganizationMetadata(row) : null;
  }

  async getOrganizationDataKeyVersion(organizationId: OrganizationId, keyVersion: number) {
    const rows = await this.sql<OrganizationDataKeyRow[]>`
      SELECT
        id,
        org_id,
        key_version,
        status,
        root_key_version,
        wrapped_storage_ref,
        custody_evidence_ref,
        created_at,
        updated_at
      FROM organization_data_keys
      WHERE org_id = ${organizationId}
        AND key_version = ${keyVersion}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toOrganizationMetadata(row) : null;
  }

  async getActiveProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    const rows = await this.sql<ProjectDataKeyRow[]>`
      SELECT
        id,
        org_id,
        project_id,
        key_version,
        status,
        organization_data_key_version,
        wrapped_storage_ref,
        created_at,
        updated_at
      FROM project_data_keys
      WHERE org_id = ${organizationId}
        AND project_id = ${projectId}
        AND status = ${"active"}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toProjectMetadata(row) : null;
  }

  async getProjectDataKeyVersion(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: number,
  ) {
    const rows = await this.sql<ProjectDataKeyRow[]>`
      SELECT
        id,
        org_id,
        project_id,
        key_version,
        status,
        organization_data_key_version,
        wrapped_storage_ref,
        created_at,
        updated_at
      FROM project_data_keys
      WHERE org_id = ${organizationId}
        AND project_id = ${projectId}
        AND key_version = ${keyVersion}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toProjectMetadata(row) : null;
  }

  private async getLatestOrganizationDataKey(organizationId: OrganizationId) {
    const rows = await this.sql<OrganizationDataKeyRow[]>`
      SELECT
        id,
        org_id,
        key_version,
        status,
        root_key_version,
        wrapped_storage_ref,
        custody_evidence_ref,
        created_at,
        updated_at
      FROM organization_data_keys
      WHERE org_id = ${organizationId}
      ORDER BY key_version DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toOrganizationMetadata(row) : null;
  }

  private async getLatestProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    const rows = await this.sql<ProjectDataKeyRow[]>`
      SELECT
        id,
        org_id,
        project_id,
        key_version,
        status,
        organization_data_key_version,
        wrapped_storage_ref,
        created_at,
        updated_at
      FROM project_data_keys
      WHERE org_id = ${organizationId}
        AND project_id = ${projectId}
      ORDER BY key_version DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toProjectMetadata(row) : null;
  }

  async insertOrganizationDataKey(input: SeedOrganizationDataKeyInput): Promise<void> {
    await this.sql`
      INSERT INTO organization_data_keys (
        id,
        org_id,
        key_version,
        status,
        root_key_version,
        wrapped_storage_ref,
        custody_evidence_ref
      )
      VALUES (
        ${input.id},
        ${input.organizationId},
        ${input.keyVersion},
        ${input.status ?? "active"},
        ${input.rootKeyVersion ?? 1},
        ${input.wrappedStorageRef ?? null},
        ${input.custodyEvidenceRef ?? null}
      )
      ON CONFLICT (org_id, key_version) DO NOTHING
    `;
  }

  async insertProjectDataKey(input: SeedProjectDataKeyInput): Promise<void> {
    await this.sql`
      INSERT INTO project_data_keys (
        id,
        org_id,
        project_id,
        key_version,
        status,
        organization_data_key_version,
        wrapped_storage_ref
      )
      VALUES (
        ${input.id},
        ${input.organizationId},
        ${input.projectId},
        ${input.keyVersion},
        ${input.status ?? "active"},
        ${input.organizationDataKeyVersion},
        ${input.wrappedStorageRef ?? null}
      )
      ON CONFLICT (project_id, key_version) DO NOTHING
    `;
  }
}
