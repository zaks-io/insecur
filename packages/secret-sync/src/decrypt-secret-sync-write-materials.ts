import {
  decryptSecretValueForRuntime,
  decryptSensitiveMetadataForAuthorizedRead,
  type Keyring,
  type PlaintextHandle,
  type SensitiveMetadataCiphertextIdentity,
} from "@insecur/crypto";
import {
  SECRET_SYNC_ERROR_CODES,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretSyncBindingId,
  type SecretSyncId,
} from "@insecur/domain";
import {
  TenantSecretVersionStore,
  TenantSensitiveMetadataStore,
  withTenantScope,
  type SecretVersionStoreRow,
  type SensitiveMetadataFieldRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import type { CloudflareWorkerScriptNameResolver } from "./cloudflare-worker-sync-adapter.js";
import {
  SECRET_SYNC_BINDING_DESTINATION_FIELD,
  SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
  SECRET_SYNC_TARGET_METADATA_TYPE,
  SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
  secretSyncBindingRecordResourceId,
  secretSyncTargetRecordResourceId,
} from "./secret-sync-metadata.js";
import { SecretSyncError } from "./secret-sync-error.js";
import type {
  ResolveSecretSyncWriteMaterialsInput,
  SecretSyncBindingWriteMaterial,
  SecretSyncDestinationNameResolver,
  SecretSyncWriteMaterialsResolver,
} from "./secret-sync-write-materials.js";

const textDecoder = new TextDecoder();

/*
 * ADR-0071 allowlisted decrypt module for AG8 Secret Sync write execution:
 * Sensitive Metadata decrypt of exact binding destination names and the
 * Cloudflare Worker script target name for provider use, plus Secret value
 * decrypt after Sync Execution Revalidation and immediately before provider
 * write. It is callable only with a Keyring, so it can execute only inside
 * the Runtime deploy (the sole keyring holder); outputs go straight to the
 * provider adapters and are never persisted.
 */

function bindingDestinationIdentity(
  organizationId: OrganizationId,
  projectId: ProjectId,
  secretSyncBindingId: SecretSyncBindingId,
): SensitiveMetadataCiphertextIdentity {
  return {
    organizationId,
    scopeProjectId: projectId,
    metadataType: SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
    recordResourceId: secretSyncBindingRecordResourceId(secretSyncBindingId),
    fieldKey: SECRET_SYNC_BINDING_DESTINATION_FIELD,
  };
}

function workerScriptTargetIdentity(
  organizationId: OrganizationId,
  projectId: ProjectId,
  secretSyncId: SecretSyncId,
): SensitiveMetadataCiphertextIdentity {
  return {
    organizationId,
    scopeProjectId: projectId,
    metadataType: SECRET_SYNC_TARGET_METADATA_TYPE,
    recordResourceId: secretSyncTargetRecordResourceId(secretSyncId),
    fieldKey: SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
  };
}

async function loadRequiredSensitiveField(
  db: TenantScopedDb,
  identity: SensitiveMetadataCiphertextIdentity,
  missingMessage: string,
): Promise<SensitiveMetadataFieldRow> {
  const field = await new TenantSensitiveMetadataStore(db).getField(identity);
  if (!field) {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.invalidDestination, missingMessage);
  }
  return field;
}

async function loadCurrentVersionRow(
  db: TenantScopedDb,
  secretId: SecretId,
): Promise<SecretVersionStoreRow> {
  const version = await new TenantSecretVersionStore(db).getCurrentVersion(secretId);
  if (!version) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.sourceValueMissing,
      "secret sync source binding has no eligible current version",
    );
  }
  return version;
}

async function decryptSensitiveMetadataText(
  keyring: Keyring,
  identity: SensitiveMetadataCiphertextIdentity,
  field: SensitiveMetadataFieldRow,
): Promise<string> {
  const plaintext = await decryptSensitiveMetadataForAuthorizedRead(
    keyring,
    identity,
    field.wrapped,
  );
  return textDecoder.decode(plaintext.unwrapUtf8());
}

async function decryptSourceValue(
  keyring: Keyring,
  input: Pick<
    ResolveSecretSyncWriteMaterialsInput,
    "organizationId" | "projectId" | "environmentId"
  >,
  version: SecretVersionStoreRow,
): Promise<PlaintextHandle> {
  return decryptSecretValueForRuntime(
    keyring,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretId: version.secretId,
    },
    version.wrapped,
  );
}

interface LoadedWriteMaterialRow {
  readonly binding: ResolveSecretSyncWriteMaterialsInput["bindings"][number];
  readonly identity: SensitiveMetadataCiphertextIdentity;
  readonly destinationField: SensitiveMetadataFieldRow;
  readonly version: SecretVersionStoreRow;
}

/**
 * Loads every wrapped row inside tenant scope first, so the whole
 * all-or-nothing write set fails (`sync.source_value_missing`, missing
 * destination) before any plaintext exists. Decrypt runs after the
 * tenant-scoped DB work completes (the INS-345 failure mode).
 */
function loadWriteMaterialRows(
  input: ResolveSecretSyncWriteMaterialsInput,
): Promise<LoadedWriteMaterialRow[]> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const rows: LoadedWriteMaterialRow[] = [];
      for (const binding of input.bindings) {
        const identity = bindingDestinationIdentity(
          input.organizationId,
          input.projectId,
          binding.bindingId,
        );
        rows.push({
          binding,
          identity,
          destinationField: await loadRequiredSensitiveField(
            db,
            identity,
            "secret sync binding destination is not configured",
          ),
          version: await loadCurrentVersionRow(db, binding.secretId),
        });
      }
      return rows;
    },
  );
}

export function createSecretSyncWriteMaterialsDecryptor(
  keyring: Keyring,
): SecretSyncWriteMaterialsResolver {
  return {
    async resolveWriteMaterials(
      input: ResolveSecretSyncWriteMaterialsInput,
    ): Promise<readonly SecretSyncBindingWriteMaterial[]> {
      const loaded = await loadWriteMaterialRows(input);
      const materials: SecretSyncBindingWriteMaterial[] = [];
      for (const row of loaded) {
        materials.push({
          bindingId: row.binding.bindingId,
          secretId: row.binding.secretId,
          secretVersionId: row.version.secretVersionId,
          destinationName: await decryptSensitiveMetadataText(
            keyring,
            row.identity,
            row.destinationField,
          ),
          value: await decryptSourceValue(keyring, input, row.version),
        });
      }
      return materials;
    },
  };
}

/**
 * Destination-name resolver for the provider adapters' Explicit Provider
 * Lookup, backed by the same allowlisted Sensitive Metadata decrypt. Names
 * resolved here go only into the exact provider request.
 */
export function createSecretSyncDestinationNameDecryptor(input: {
  readonly keyring: Keyring;
  readonly projectId: ProjectId;
}): SecretSyncDestinationNameResolver {
  return {
    async resolveDestinationName(request): Promise<string> {
      const identity = bindingDestinationIdentity(
        request.organizationId,
        input.projectId,
        request.bindingId,
      );
      const field = await withTenantScope(
        { kind: "organization", organizationId: request.organizationId },
        async ({ db }) =>
          loadRequiredSensitiveField(
            db,
            identity,
            "secret sync binding destination is not configured",
          ),
      );
      return decryptSensitiveMetadataText(input.keyring, identity, field);
    },
  };
}

/**
 * Worker-script target resolver for the Cloudflare adapter, backed by the
 * same allowlisted Sensitive Metadata decrypt (ADR-0071 amendment
 * 2026-07-16, INS-79). The resolved script name goes only into the exact
 * provider request; it never reaches operation records or audit events.
 */
export function createSecretSyncWorkerScriptNameDecryptor(input: {
  readonly keyring: Keyring;
  readonly projectId: ProjectId;
}): CloudflareWorkerScriptNameResolver {
  return {
    async resolveWorkerScriptName(request): Promise<string> {
      const identity = workerScriptTargetIdentity(
        request.organizationId,
        input.projectId,
        request.secretSyncId,
      );
      const field = await withTenantScope(
        { kind: "organization", organizationId: request.organizationId },
        async ({ db }) =>
          loadRequiredSensitiveField(
            db,
            identity,
            "cloudflare worker secret sync target is not configured",
          ),
      );
      return decryptSensitiveMetadataText(input.keyring, identity, field);
    },
  };
}
