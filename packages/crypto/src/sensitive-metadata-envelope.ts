import { assertSensitiveMetadataIdentityForAad } from "./assert-ciphertext-identity.js";
import {
  RECORD_TYPE_SENSITIVE_METADATA,
  SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
} from "./constants.js";
import { DecryptError } from "./errors.js";
import { PlaintextHandle } from "./plaintext-handle.js";
import { serializeAadFields } from "./envelope-aad.js";
import { openTenantBoundEnvelope, sealTenantBoundEnvelope } from "./envelope-engine.js";
import { toStoreFacingCiphertext } from "./envelope-storage.js";
import type { Keyring } from "./keyring.js";
import type { ProjectId } from "@insecur/domain";
import type { SensitiveMetadataCiphertextIdentity } from "./types.js";
import type { WrappedSensitiveMetadata } from "@insecur/custody-contracts";

export type { WrappedSensitiveMetadata } from "@insecur/custody-contracts";

export function isOrganizationScopedSensitiveMetadata(
  identity: SensitiveMetadataCiphertextIdentity,
): identity is SensitiveMetadataCiphertextIdentity & { scopeProjectId: "" } {
  return identity.scopeProjectId === SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL;
}

export function serializeSensitiveMetadataCiphertextAad(
  identity: SensitiveMetadataCiphertextIdentity,
): Uint8Array {
  assertSensitiveMetadataIdentityForAad(identity);
  return serializeAadFields([
    String(RECORD_TYPE_SENSITIVE_METADATA),
    identity.organizationId,
    identity.scopeProjectId,
    identity.metadataType,
    identity.recordResourceId,
    identity.fieldKey,
  ]);
}

export function sensitiveMetadataIdentityMatches(
  left: SensitiveMetadataCiphertextIdentity,
  right: SensitiveMetadataCiphertextIdentity,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.scopeProjectId === right.scopeProjectId &&
    left.metadataType === right.metadataType &&
    left.recordResourceId === right.recordResourceId &&
    left.fieldKey === right.fieldKey
  );
}

function requireProjectScope(identity: SensitiveMetadataCiphertextIdentity): ProjectId {
  if (isOrganizationScopedSensitiveMetadata(identity)) {
    throw new Error("expected project-scoped sensitive metadata identity");
  }
  return identity.scopeProjectId as ProjectId;
}

export async function encryptSensitiveMetadata(
  keyring: Keyring,
  identity: SensitiveMetadataCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedSensitiveMetadata> {
  assertSensitiveMetadataIdentityForAad(identity);
  if (isOrganizationScopedSensitiveMetadata(identity)) {
    const activeVersions = await keyring.getActiveOrganizationDataKeyVersions(
      identity.organizationId,
    );
    const organizationDataKey = await keyring.getOrganizationDataKey(
      identity.organizationId,
      activeVersions,
    );
    const ciphertext = await sealTenantBoundEnvelope({
      recordType: RECORD_TYPE_SENSITIVE_METADATA,
      tenantDataKey: organizationDataKey,
      tenantDataKeyVersion: activeVersions.organizationDataKeyVersion,
      ciphertextAad: serializeSensitiveMetadataCiphertextAad(identity),
      plaintextUtf8,
    });
    return {
      organizationDataKeyVersion: activeVersions.organizationDataKeyVersion,
      projectDataKeyVersion: null,
      ciphertext,
      identity,
    };
  }

  const projectId = requireProjectScope(identity);
  const activeVersions = await keyring.getActiveDataKeyVersions(identity.organizationId, projectId);
  const projectDataKey = await keyring.getProjectDataKey(
    identity.organizationId,
    projectId,
    activeVersions,
  );
  const ciphertext = await sealTenantBoundEnvelope({
    recordType: RECORD_TYPE_SENSITIVE_METADATA,
    tenantDataKey: projectDataKey,
    tenantDataKeyVersion: activeVersions.projectDataKeyVersion,
    ciphertextAad: serializeSensitiveMetadataCiphertextAad(identity),
    plaintextUtf8,
  });
  return {
    organizationDataKeyVersion: activeVersions.organizationDataKeyVersion,
    projectDataKeyVersion: activeVersions.projectDataKeyVersion,
    ciphertext,
    identity,
  };
}

/**
 * Decrypt for authorized Sensitive Detail Gate surfaces only.
 */
export async function decryptSensitiveMetadataForAuthorizedRead(
  keyring: Keyring,
  identity: SensitiveMetadataCiphertextIdentity,
  wrapped: WrappedSensitiveMetadata,
): Promise<PlaintextHandle> {
  if (
    wrapped.identity !== undefined &&
    !sensitiveMetadataIdentityMatches(identity, wrapped.identity)
  ) {
    throw new DecryptError();
  }

  assertSensitiveMetadataIdentityForAad(identity);
  if (isOrganizationScopedSensitiveMetadata(identity)) {
    if (wrapped.projectDataKeyVersion !== null) {
      throw new DecryptError();
    }
    const versions = await keyring.resolveOrganizationDataKeyVersions(
      identity.organizationId,
      wrapped.organizationDataKeyVersion,
    );
    const organizationDataKey = await keyring.getOrganizationDataKey(
      identity.organizationId,
      versions,
    );
    return new PlaintextHandle(
      await openTenantBoundEnvelope({
        recordType: RECORD_TYPE_SENSITIVE_METADATA,
        envelopeBytes: wrapped.ciphertext,
        tenantDataKey: organizationDataKey,
        ciphertextAad: serializeSensitiveMetadataCiphertextAad(identity),
      }),
    );
  }

  const projectId = requireProjectScope(identity);
  if (wrapped.projectDataKeyVersion === null) {
    throw new DecryptError();
  }
  const projectDataKey = await keyring.getProjectDataKey(identity.organizationId, projectId, {
    organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: wrapped.projectDataKeyVersion,
  });
  return new PlaintextHandle(
    await openTenantBoundEnvelope({
      recordType: RECORD_TYPE_SENSITIVE_METADATA,
      envelopeBytes: wrapped.ciphertext,
      tenantDataKey: projectDataKey,
      ciphertextAad: serializeSensitiveMetadataCiphertextAad(identity),
    }),
  );
}

export { toStoreFacingCiphertext };
