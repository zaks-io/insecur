import {
  encryptSensitiveMetadata,
  type Keyring,
  type SensitiveMetadataFieldKey,
  type SensitiveMetadataType,
} from "@insecur/crypto";
import type {
  OpaqueResourceId,
  ProjectId,
  SecretSyncBindingId,
  SecretSyncId,
} from "@insecur/domain";
import type { OrganizationId } from "@insecur/domain";
import type { TenantScopedDb, TenantSensitiveMetadataStore } from "@insecur/tenant-store";

import {
  SECRET_SYNC_BINDING_DESTINATION_FIELD,
  SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
  SECRET_SYNC_TARGET_METADATA_TYPE,
  SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
  secretSyncBindingRecordResourceId,
  secretSyncTargetRecordResourceId,
} from "./secret-sync-metadata.js";

const textEncoder = new TextEncoder();

interface UpsertEncryptedMetadataFieldInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly recordResourceId: OpaqueResourceId;
  readonly metadataType: SensitiveMetadataType;
  readonly fieldKey: SensitiveMetadataFieldKey;
  readonly plaintext: string;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function upsertEncryptedMetadataField(
  input: UpsertEncryptedMetadataFieldInput,
): Promise<void> {
  const wrapped = await encryptSensitiveMetadata(
    input.keyring,
    {
      organizationId: input.organizationId,
      scopeProjectId: input.projectId,
      metadataType: input.metadataType,
      recordResourceId: input.recordResourceId,
      fieldKey: input.fieldKey,
    },
    textEncoder.encode(input.plaintext),
  );

  await input.sensitiveMetadataStore.upsertField({
    organizationId: input.organizationId,
    scopeProjectId: input.projectId,
    metadataType: input.metadataType,
    recordResourceId: input.recordResourceId,
    fieldKey: input.fieldKey,
    wrapped,
  });
}

export async function storeSecretSyncBindingDestinations(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly secretSyncId: SecretSyncId;
  readonly bindings: readonly {
    readonly bindingId: SecretSyncBindingId;
    readonly providerDestination: string;
  }[];
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}): Promise<void> {
  for (const binding of input.bindings) {
    await upsertEncryptedMetadataField({
      organizationId: input.organizationId,
      projectId: input.projectId,
      recordResourceId: secretSyncBindingRecordResourceId(binding.bindingId),
      metadataType: SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
      fieldKey: SECRET_SYNC_BINDING_DESTINATION_FIELD,
      plaintext: binding.providerDestination,
      keyring: input.keyring,
      sensitiveMetadataStore: input.sensitiveMetadataStore,
    });
  }
}

export async function storeSecretSyncWorkerScriptTarget(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly secretSyncId: SecretSyncId;
  readonly workerScriptName: string;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}): Promise<void> {
  await upsertEncryptedMetadataField({
    organizationId: input.organizationId,
    projectId: input.projectId,
    recordResourceId: secretSyncTargetRecordResourceId(input.secretSyncId),
    metadataType: SECRET_SYNC_TARGET_METADATA_TYPE,
    fieldKey: SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
    plaintext: input.workerScriptName,
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  });
}

async function hasSensitiveMetadataField(input: {
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly metadataType: SensitiveMetadataType;
  readonly recordResourceId: OpaqueResourceId;
  readonly fieldKey: SensitiveMetadataFieldKey;
}): Promise<boolean> {
  const field = await input.sensitiveMetadataStore.getField({
    organizationId: input.organizationId,
    scopeProjectId: input.projectId,
    metadataType: input.metadataType,
    recordResourceId: input.recordResourceId,
    fieldKey: input.fieldKey,
  });
  return field !== null;
}

export async function loadSecretSyncSensitiveMetadata(input: {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly secretSyncId: SecretSyncId;
  readonly bindingIds: readonly SecretSyncBindingId[];
}): Promise<{
  readonly workerScriptName: string | null;
  readonly bindingDestinations: ReadonlyMap<SecretSyncBindingId, string>;
}> {
  const { TenantSensitiveMetadataStore } = await import("@insecur/tenant-store");
  const sensitiveMetadataStore = new TenantSensitiveMetadataStore(input.db);
  const bindingDestinations = new Map<SecretSyncBindingId, string>();

  for (const bindingId of input.bindingIds) {
    const present = await hasSensitiveMetadataField({
      sensitiveMetadataStore,
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadataType: SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
      recordResourceId: secretSyncBindingRecordResourceId(bindingId),
      fieldKey: SECRET_SYNC_BINDING_DESTINATION_FIELD,
    });
    if (present) {
      bindingDestinations.set(bindingId, "present");
    }
  }

  const workerScriptPresent = await hasSensitiveMetadataField({
    sensitiveMetadataStore,
    organizationId: input.organizationId,
    projectId: input.projectId,
    metadataType: SECRET_SYNC_TARGET_METADATA_TYPE,
    recordResourceId: secretSyncTargetRecordResourceId(input.secretSyncId),
    fieldKey: SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
  });

  return {
    workerScriptName: workerScriptPresent ? "present" : null,
    bindingDestinations,
  };
}
