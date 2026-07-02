import { RECORD_TYPE_SECRET } from "./constants.js";
import { assertSecretIdentityForAad } from "./assert-ciphertext-identity.js";
import { DecryptError } from "./errors.js";
import { PlaintextHandle } from "./plaintext-handle.js";
import { serializeAadFields } from "./envelope-aad.js";
import {
  openTenantBoundEnvelope,
  sealTenantBoundEnvelope,
  type DekWrapTenantCoordinate,
} from "./envelope-engine.js";
import type { Keyring } from "./keyring.js";
import type { SecretCiphertextIdentity } from "./types.js";
import type { WrappedSecretValue } from "@insecur/custody-contracts";

export type { WrappedSecretValue } from "@insecur/custody-contracts";

function secretDekWrapTenantCoordinate(
  identity: SecretCiphertextIdentity,
): DekWrapTenantCoordinate {
  return {
    organizationId: identity.organizationId,
    scopeProjectId: identity.projectId,
  };
}

/**
 * Canonical ciphertext-layer AAD for Secret records.
 * Identity is recomputed at decrypt; it is never stored alongside ciphertext.
 */
export function serializeSecretCiphertextAad(identity: SecretCiphertextIdentity): Uint8Array {
  assertSecretIdentityForAad(identity);
  return serializeAadFields([
    String(RECORD_TYPE_SECRET),
    identity.organizationId,
    identity.projectId,
    identity.environmentId,
    identity.secretId,
  ]);
}

function identityMatches(left: SecretCiphertextIdentity, right: SecretCiphertextIdentity): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.secretId === right.secretId
  );
}

/**
 * Write-path encryption for Blind Secret Write and storage.
 * Accepts plaintext only at the encryption boundary; callers must not log input.
 */
export async function encryptSecretValue(
  keyring: Keyring,
  identity: SecretCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedSecretValue> {
  assertSecretIdentityForAad(identity);
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
    dekWrapTenantCoordinate: secretDekWrapTenantCoordinate(identity),
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
  keyring: Keyring,
  identity: SecretCiphertextIdentity,
  wrapped: WrappedSecretValue,
): Promise<PlaintextHandle> {
  if (wrapped.identity !== undefined && !identityMatches(identity, wrapped.identity)) {
    throw new DecryptError();
  }

  assertSecretIdentityForAad(identity);
  const projectDataKey = await keyring.getProjectDataKey(
    identity.organizationId,
    identity.projectId,
    {
      organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
      projectDataKeyVersion: wrapped.projectDataKeyVersion,
    },
  );

  const plaintext = await openTenantBoundEnvelope({
    recordType: RECORD_TYPE_SECRET,
    envelopeBytes: wrapped.ciphertext,
    tenantDataKey: projectDataKey,
    dekWrapTenantCoordinate: secretDekWrapTenantCoordinate(identity),
    ciphertextAad: serializeSecretCiphertextAad(identity),
  });
  return new PlaintextHandle(plaintext);
}
