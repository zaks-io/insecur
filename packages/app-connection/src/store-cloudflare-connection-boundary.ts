import { SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL, type Keyring } from "@insecur/crypto";
import type { AppConnectionId, OrganizationId, ProjectId } from "@insecur/domain";
import type { TenantSensitiveMetadataStore } from "@insecur/tenant-store";

import {
  CLOUDFLARE_BOUNDARY_FIELD_KEYS,
  CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE,
  CLOUDFLARE_CONNECTION_LINKAGE_METADATA_TYPE,
  CLOUDFLARE_LINKAGE_FIELD_KEYS,
  cloudflareConnectionRecordResourceId,
  type CloudflareConnectionBoundary,
} from "./cloudflare-scoped-token-metadata.js";
import { upsertEncryptedMetadataField } from "./upsert-encrypted-metadata-field.js";

export interface StoreCloudflareConnectionBoundaryInput {
  readonly organizationId: OrganizationId;
  readonly projectId?: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly boundary: CloudflareConnectionBoundary;
  readonly providerAccountId: string;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export async function storeCloudflareConnectionBoundary(
  input: StoreCloudflareConnectionBoundaryInput,
): Promise<void> {
  const scopeProjectId: ProjectId | "" =
    input.projectId ?? SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL;
  const recordResourceId = cloudflareConnectionRecordResourceId(input.appConnectionId);
  const shared = {
    organizationId: input.organizationId,
    scopeProjectId,
    recordResourceId,
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  };

  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE,
    fieldKey: CLOUDFLARE_BOUNDARY_FIELD_KEYS.allowedAccountId,
    plaintext: input.boundary.allowedAccountId,
  });
  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE,
    fieldKey: CLOUDFLARE_BOUNDARY_FIELD_KEYS.allowedWorkerScript,
    plaintext: input.boundary.allowedWorkerScript,
  });
  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: CLOUDFLARE_CONNECTION_LINKAGE_METADATA_TYPE,
    fieldKey: CLOUDFLARE_LINKAGE_FIELD_KEYS.providerAccountId,
    plaintext: input.providerAccountId,
  });
}
