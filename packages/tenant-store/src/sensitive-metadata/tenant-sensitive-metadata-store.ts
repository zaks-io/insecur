import type { OpaqueResourceId, OrganizationId, ProjectId } from "@insecur/domain";
import { toStoreFacingCiphertext } from "@insecur/crypto";

import {
  decodeInlineCiphertextStorageRef,
  encodeInlineCiphertextStorageRef,
} from "../secrets/ciphertext-storage-ref.js";
import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import type {
  SensitiveMetadataFieldRow,
  StoredWrappedSensitiveMetadata,
  UpsertSensitiveMetadataInput,
} from "./types.js";

interface SensitiveMetadataDbRow {
  org_id: string;
  scope_project_id: string | null;
  metadata_type: string;
  record_resource_id: string;
  field_key: string;
  organization_data_key_version: number;
  project_data_key_version: number | null;
  ciphertext_storage_ref: string;
}

function toStoredWrappedMaterial(row: SensitiveMetadataDbRow): StoredWrappedSensitiveMetadata {
  return {
    organizationDataKeyVersion: row.organization_data_key_version,
    projectDataKeyVersion: row.project_data_key_version,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertext_storage_ref),
  };
}

export class TenantSensitiveMetadataStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async upsertField(input: UpsertSensitiveMetadataInput): Promise<void> {
    const storageRef = encodeInlineCiphertextStorageRef(toStoreFacingCiphertext(input.wrapped));
    const scopeProjectId = input.scopeProjectId === "" ? "" : input.scopeProjectId;
    await this.sql`
      INSERT INTO sensitive_metadata_fields (
        org_id,
        scope_project_id,
        metadata_type,
        record_resource_id,
        field_key,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref
      )
      VALUES (
        ${input.organizationId},
        ${scopeProjectId},
        ${input.metadataType},
        ${input.recordResourceId},
        ${input.fieldKey},
        ${input.wrapped.organizationDataKeyVersion},
        ${input.wrapped.projectDataKeyVersion},
        ${storageRef}
      )
      ON CONFLICT (org_id, scope_project_id, metadata_type, record_resource_id, field_key) DO UPDATE
      SET
        organization_data_key_version = EXCLUDED.organization_data_key_version,
        project_data_key_version = EXCLUDED.project_data_key_version,
        ciphertext_storage_ref = EXCLUDED.ciphertext_storage_ref
    `;
  }

  async getField(
    organizationId: OrganizationId,
    metadataType: string,
    recordResourceId: OpaqueResourceId,
    fieldKey: string,
  ): Promise<SensitiveMetadataFieldRow | null> {
    const rows = await this.sql<SensitiveMetadataDbRow[]>`
      SELECT
        org_id,
        scope_project_id,
        metadata_type,
        record_resource_id,
        field_key,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref
      FROM sensitive_metadata_fields
      WHERE org_id = ${organizationId}
        AND metadata_type = ${metadataType}
        AND record_resource_id = ${recordResourceId}
        AND field_key = ${fieldKey}
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      organizationId,
      scopeProjectId: row.scope_project_id === "" ? null : (row.scope_project_id as ProjectId),
      metadataType: row.metadata_type,
      recordResourceId: row.record_resource_id as OpaqueResourceId,
      fieldKey: row.field_key,
      wrapped: toStoredWrappedMaterial(row),
    };
  }
}
