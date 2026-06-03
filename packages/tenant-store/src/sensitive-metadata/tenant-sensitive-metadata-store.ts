import type { OpaqueResourceId, OrganizationId, ProjectId } from "@insecur/domain";
import { toStoreFacingCiphertext } from "@insecur/crypto";
import { and, eq } from "drizzle-orm";

import { sensitiveMetadataFields } from "../db/schema/tenant-integrations.js";
import {
  decodeInlineCiphertextStorageRef,
  encodeInlineCiphertextStorageRef,
} from "../secrets/ciphertext-storage-ref.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type {
  SensitiveMetadataFieldRow,
  StoredWrappedSensitiveMetadata,
  UpsertSensitiveMetadataInput,
} from "./types.js";

function toStoredWrappedMaterial(row: {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number | null;
  ciphertextStorageRef: string;
}): StoredWrappedSensitiveMetadata {
  return {
    organizationDataKeyVersion: row.organizationDataKeyVersion,
    projectDataKeyVersion: row.projectDataKeyVersion,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertextStorageRef),
  };
}

export class TenantSensitiveMetadataStore {
  constructor(private readonly db: TenantScopedDb) {}

  async upsertField(input: UpsertSensitiveMetadataInput): Promise<void> {
    const storageRef = encodeInlineCiphertextStorageRef(toStoreFacingCiphertext(input.wrapped));
    const scopeProjectId = input.scopeProjectId === "" ? "" : input.scopeProjectId;
    await this.db
      .insert(sensitiveMetadataFields)
      .values({
        orgId: input.organizationId,
        scopeProjectId,
        metadataType: input.metadataType,
        recordResourceId: input.recordResourceId,
        fieldKey: input.fieldKey,
        organizationDataKeyVersion: input.wrapped.organizationDataKeyVersion,
        projectDataKeyVersion: input.wrapped.projectDataKeyVersion,
        ciphertextStorageRef: storageRef,
      })
      .onConflictDoUpdate({
        target: [
          sensitiveMetadataFields.orgId,
          sensitiveMetadataFields.scopeProjectId,
          sensitiveMetadataFields.metadataType,
          sensitiveMetadataFields.recordResourceId,
          sensitiveMetadataFields.fieldKey,
        ],
        set: {
          organizationDataKeyVersion: input.wrapped.organizationDataKeyVersion,
          projectDataKeyVersion: input.wrapped.projectDataKeyVersion,
          ciphertextStorageRef: storageRef,
        },
      });
  }

  async getField(
    organizationId: OrganizationId,
    metadataType: string,
    recordResourceId: OpaqueResourceId,
    fieldKey: string,
  ): Promise<SensitiveMetadataFieldRow | null> {
    const rows = await this.db
      .select({
        org_id: sensitiveMetadataFields.orgId,
        scope_project_id: sensitiveMetadataFields.scopeProjectId,
        metadata_type: sensitiveMetadataFields.metadataType,
        record_resource_id: sensitiveMetadataFields.recordResourceId,
        field_key: sensitiveMetadataFields.fieldKey,
        organization_data_key_version: sensitiveMetadataFields.organizationDataKeyVersion,
        project_data_key_version: sensitiveMetadataFields.projectDataKeyVersion,
        ciphertext_storage_ref: sensitiveMetadataFields.ciphertextStorageRef,
      })
      .from(sensitiveMetadataFields)
      .where(
        and(
          eq(sensitiveMetadataFields.orgId, organizationId),
          eq(sensitiveMetadataFields.metadataType, metadataType),
          eq(sensitiveMetadataFields.recordResourceId, recordResourceId),
          eq(sensitiveMetadataFields.fieldKey, fieldKey),
        ),
      );
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
      wrapped: toStoredWrappedMaterial({
        organizationDataKeyVersion: row.organization_data_key_version,
        projectDataKeyVersion: row.project_data_key_version,
        ciphertextStorageRef: row.ciphertext_storage_ref,
      }),
    };
  }
}
