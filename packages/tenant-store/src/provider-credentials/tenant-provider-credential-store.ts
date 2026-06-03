import type { AppConnectionId, OrganizationId, ProviderCredentialId } from "@insecur/domain";
import { toStoreFacingCiphertext } from "@insecur/crypto";
import { and, eq } from "drizzle-orm";

import { providerCredentials } from "../db/schema/tenant-integrations.js";
import {
  decodeInlineCiphertextStorageRef,
  encodeInlineCiphertextStorageRef,
} from "../secrets/ciphertext-storage-ref.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type {
  ProviderCredentialRow,
  StoredWrappedProviderCredential,
  UpsertProviderCredentialInput,
} from "./types.js";

function toStoredWrappedMaterial(row: {
  organizationDataKeyVersion: number;
  ciphertextStorageRef: string;
}): StoredWrappedProviderCredential {
  return {
    organizationDataKeyVersion: row.organizationDataKeyVersion,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertextStorageRef),
  };
}

export class TenantProviderCredentialStore {
  constructor(private readonly db: TenantScopedDb) {}

  async upsertCredential(input: UpsertProviderCredentialInput): Promise<void> {
    const storageRef = encodeInlineCiphertextStorageRef(toStoreFacingCiphertext(input.wrapped));
    await this.db
      .insert(providerCredentials)
      .values({
        id: input.credentialId,
        orgId: input.organizationId,
        appConnectionId: input.appConnectionId,
        provider: input.provider,
        organizationDataKeyVersion: input.wrapped.organizationDataKeyVersion,
        ciphertextStorageRef: storageRef,
      })
      .onConflictDoUpdate({
        target: [providerCredentials.orgId, providerCredentials.id],
        set: {
          appConnectionId: input.appConnectionId,
          provider: input.provider,
          organizationDataKeyVersion: input.wrapped.organizationDataKeyVersion,
          ciphertextStorageRef: storageRef,
        },
      });
  }

  async getCredential(
    organizationId: OrganizationId,
    credentialId: ProviderCredentialId,
  ): Promise<ProviderCredentialRow | null> {
    const rows = await this.db
      .select({
        id: providerCredentials.id,
        org_id: providerCredentials.orgId,
        app_connection_id: providerCredentials.appConnectionId,
        provider: providerCredentials.provider,
        organization_data_key_version: providerCredentials.organizationDataKeyVersion,
        ciphertext_storage_ref: providerCredentials.ciphertextStorageRef,
      })
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.orgId, organizationId),
          eq(providerCredentials.id, credentialId),
        ),
      );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: credentialId,
      organizationId,
      appConnectionId: row.app_connection_id as AppConnectionId,
      provider: row.provider,
      wrapped: toStoredWrappedMaterial({
        organizationDataKeyVersion: row.organization_data_key_version,
        ciphertextStorageRef: row.ciphertext_storage_ref,
      }),
    };
  }
}
