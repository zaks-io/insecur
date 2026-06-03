import { RECORD_TYPE_SECRET } from "./constants.js";
import { getKeyring } from "./crypto-runtime.js";
import { DecryptError } from "./errors.js";
import { serializeAadFields } from "./envelope-aad.js";
import {
  openTenantBoundEnvelope,
  sealTenantBoundEnvelope,
  serializeDekWrapAad,
} from "./envelope-engine.js";
import { toStoreFacingCiphertext } from "./envelope-storage.js";
import type { SecretCiphertextIdentity } from "./types.js";

export { serializeDekWrapAad };

/**
 * Canonical ciphertext-layer AAD for Secret records.
 * Identity is recomputed at decrypt; it is never stored alongside ciphertext.
 */
export function serializeSecretCiphertextAad(identity: SecretCiphertextIdentity): Uint8Array {
  return serializeAadFields([
    String(RECORD_TYPE_SECRET),
    identity.organizationId,
    identity.projectId,
    identity.environmentId,
    identity.secretId,
  ]);
}

/** DEK-wrap layer AAD binds format marker and project data-key version. */
export function serializeSecretDekWrapAad(projectDataKeyVersion: number): Uint8Array {
  return serializeDekWrapAad(RECORD_TYPE_SECRET, projectDataKeyVersion);
}

export function identityMatches(
  left: SecretCiphertextIdentity,
  right: SecretCiphertextIdentity,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.secretId === right.secretId
  );
}

/** Wrapped material returned to callers; never plaintext at rest. */
export interface WrappedSecretValue {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number;
  ciphertext: Uint8Array;
  /**
   * Optional encrypt-path echo. Persisted Secret Version rows store only
   * key-version columns and ciphertext bytes.
   */
  identity?: SecretCiphertextIdentity;
}

/**
 * Write-path encryption for Blind Secret Write and storage.
 * Accepts plaintext only at the encryption boundary; callers must not log input.
 */
export async function encryptSecretValue(
  identity: SecretCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedSecretValue> {
  const keyring = getKeyring();
  const activeVersions = await keyring.getActiveDataKeyVersions(
    identity.organizationId,
    identity.projectId,
  );
  const projectDataKey = await keyring.getProjectDataKey(
    identity.organizationId,
    identity.projectId,
    activeVersions,
  );
  const ciphertext = await sealTenantBoundEnvelope({
    recordType: RECORD_TYPE_SECRET,
    tenantDataKey: projectDataKey,
    tenantDataKeyVersion: activeVersions.projectDataKeyVersion,
    ciphertextAad: serializeSecretCiphertextAad(identity),
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
 * Runtime-only decrypt for approved Injection Grant consume.
 * Must not be used for reveal, export, or CLI/API read paths.
 */
export async function decryptSecretValueForRuntime(
  identity: SecretCiphertextIdentity,
  wrapped: WrappedSecretValue,
): Promise<Uint8Array> {
  if (wrapped.identity !== undefined && !identityMatches(identity, wrapped.identity)) {
    throw new DecryptError();
  }

  const keyring = getKeyring();
  const projectDataKey = await keyring.getProjectDataKey(
    identity.organizationId,
    identity.projectId,
    {
      organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
      projectDataKeyVersion: wrapped.projectDataKeyVersion,
    },
  );

  return openTenantBoundEnvelope({
    recordType: RECORD_TYPE_SECRET,
    envelopeBytes: wrapped.ciphertext,
    tenantDataKey: projectDataKey,
    ciphertextAad: serializeSecretCiphertextAad(identity),
  });
}

export { toStoreFacingCiphertext };
