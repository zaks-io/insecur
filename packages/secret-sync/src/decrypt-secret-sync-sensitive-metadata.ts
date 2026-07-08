import {
  decryptSensitiveMetadataForAuthorizedRead,
  type Keyring,
  type WrappedSensitiveMetadata,
} from "@insecur/crypto";
import type {
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  SecretSyncBindingId,
  SecretSyncId,
} from "@insecur/domain";

import {
  SECRET_SYNC_BINDING_DESTINATION_FIELD,
  SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
  SECRET_SYNC_TARGET_METADATA_TYPE,
  SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
  secretSyncBindingRecordResourceId,
  secretSyncTargetRecordResourceId,
} from "./secret-sync-metadata.js";

const textDecoder = new TextDecoder();

async function decryptSecretSyncSensitiveMetadataField(
  keyring: Keyring,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly metadataType:
      | typeof SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE
      | typeof SECRET_SYNC_TARGET_METADATA_TYPE;
    readonly recordResourceId: OpaqueResourceId;
    readonly fieldKey:
      typeof SECRET_SYNC_BINDING_DESTINATION_FIELD | typeof SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD;
  },
  wrapped: WrappedSensitiveMetadata,
): Promise<string> {
  const plaintext = await decryptSensitiveMetadataForAuthorizedRead(
    keyring,
    {
      organizationId: input.organizationId,
      scopeProjectId: input.projectId,
      metadataType: input.metadataType,
      recordResourceId: input.recordResourceId,
      fieldKey: input.fieldKey,
    },
    wrapped,
  );
  return textDecoder.decode(plaintext.unwrapUtf8());
}

/** Allowlisted sensitive-metadata decrypt for Secret Sync execution surfaces only. */
export async function decryptSecretSyncBindingDestinationForAuthorizedRead(
  keyring: Keyring,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly bindingId: SecretSyncBindingId;
  },
  wrapped: WrappedSensitiveMetadata,
): Promise<string> {
  return decryptSecretSyncSensitiveMetadataField(
    keyring,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadataType: SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
      recordResourceId: secretSyncBindingRecordResourceId(input.bindingId),
      fieldKey: SECRET_SYNC_BINDING_DESTINATION_FIELD,
    },
    wrapped,
  );
}

/** Allowlisted sensitive-metadata decrypt for Secret Sync execution surfaces only. */
export async function decryptSecretSyncWorkerScriptTargetForAuthorizedRead(
  keyring: Keyring,
  input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly secretSyncId: SecretSyncId;
  },
  wrapped: WrappedSensitiveMetadata,
): Promise<string> {
  return decryptSecretSyncSensitiveMetadataField(
    keyring,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadataType: SECRET_SYNC_TARGET_METADATA_TYPE,
      recordResourceId: secretSyncTargetRecordResourceId(input.secretSyncId),
      fieldKey: SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
    },
    wrapped,
  );
}
