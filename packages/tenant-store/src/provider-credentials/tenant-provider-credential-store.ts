import type { AppConnectionId, OrganizationId, ProviderCredentialId } from "@insecur/domain";
import { toStoreFacingCiphertext } from "@insecur/crypto";

import {
  decodeInlineCiphertextStorageRef,
  encodeInlineCiphertextStorageRef,
} from "../secrets/ciphertext-storage-ref.js";
import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import type {
  ProviderCredentialRow,
  StoredWrappedProviderCredential,
  UpsertProviderCredentialInput,
} from "./types.js";

interface ProviderCredentialDbRow {
  id: string;
  org_id: string;
  app_connection_id: string;
  provider: string;
  organization_data_key_version: number;
  ciphertext_storage_ref: string;
}

function toStoredWrappedMaterial(row: ProviderCredentialDbRow): StoredWrappedProviderCredential {
  return {
    organizationDataKeyVersion: row.organization_data_key_version,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertext_storage_ref),
  };
}

export class TenantProviderCredentialStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async upsertCredential(input: UpsertProviderCredentialInput): Promise<void> {
    const storageRef = encodeInlineCiphertextStorageRef(toStoreFacingCiphertext(input.wrapped));
    await this.sql`
      INSERT INTO provider_credentials (
        id,
        org_id,
        app_connection_id,
        provider,
        organization_data_key_version,
        ciphertext_storage_ref
      )
      VALUES (
        ${input.credentialId},
        ${input.organizationId},
        ${input.appConnectionId},
        ${input.provider},
        ${input.wrapped.organizationDataKeyVersion},
        ${storageRef}
      )
      ON CONFLICT (org_id, id) DO UPDATE
      SET
        app_connection_id = EXCLUDED.app_connection_id,
        provider = EXCLUDED.provider,
        organization_data_key_version = EXCLUDED.organization_data_key_version,
        ciphertext_storage_ref = EXCLUDED.ciphertext_storage_ref
    `;
  }

  async getCredential(
    organizationId: OrganizationId,
    credentialId: ProviderCredentialId,
  ): Promise<ProviderCredentialRow | null> {
    const rows = await this.sql<ProviderCredentialDbRow[]>`
      SELECT
        id,
        org_id,
        app_connection_id,
        provider,
        organization_data_key_version,
        ciphertext_storage_ref
      FROM provider_credentials
      WHERE org_id = ${organizationId}
        AND id = ${credentialId}
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: credentialId,
      organizationId,
      appConnectionId: row.app_connection_id as AppConnectionId,
      provider: row.provider,
      wrapped: toStoredWrappedMaterial(row),
    };
  }
}
