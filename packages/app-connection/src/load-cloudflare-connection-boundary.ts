import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { TenantSensitiveMetadataStore } from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";
import {
  CLOUDFLARE_BOUNDARY_FIELD_KEYS,
  CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE,
  cloudflareConnectionRecordResourceId,
  type CloudflareConnectionBoundary,
} from "./cloudflare-scoped-token-metadata.js";
import { decryptCloudflareConnectionBoundaryForValidation } from "./decrypt-cloudflare-connection-boundary-for-validation.js";

const textDecoder = new TextDecoder();

export interface LoadCloudflareConnectionBoundaryInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function decryptBoundaryField(
  input: LoadCloudflareConnectionBoundaryInput,
  fieldKey: string,
): Promise<string> {
  const recordResourceId = cloudflareConnectionRecordResourceId(input.appConnectionId);
  const storedField = await input.sensitiveMetadataStore.getField({
    organizationId: input.organizationId,
    scopeProjectId: input.projectId,
    metadataType: CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE,
    recordResourceId,
    fieldKey,
  });
  if (!storedField) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
  }

  const plaintext = await decryptCloudflareConnectionBoundaryForValidation(
    input.keyring,
    {
      organizationId: input.organizationId,
      scopeProjectId: input.projectId,
      metadataType: CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE,
      recordResourceId,
      fieldKey,
    },
    storedField.wrapped,
  );
  return textDecoder.decode(plaintext.unwrapUtf8());
}

export async function loadCloudflareConnectionBoundary(
  input: LoadCloudflareConnectionBoundaryInput,
): Promise<CloudflareConnectionBoundary> {
  const [allowedAccountId, allowedWorkerScript] = await Promise.all([
    decryptBoundaryField(input, CLOUDFLARE_BOUNDARY_FIELD_KEYS.allowedAccountId),
    decryptBoundaryField(input, CLOUDFLARE_BOUNDARY_FIELD_KEYS.allowedWorkerScript),
  ]);

  return { allowedAccountId, allowedWorkerScript };
}
