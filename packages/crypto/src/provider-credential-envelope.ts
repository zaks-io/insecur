import { assertProviderCredentialIdentityForAad } from "./assert-ciphertext-identity.js";
import { RECORD_TYPE_PROVIDER_CREDENTIAL } from "./constants.js";
import { DecryptError } from "./errors.js";
import { PlaintextHandle } from "./plaintext-handle.js";
import { serializeAadFields } from "./envelope-aad.js";
import { openTenantBoundEnvelope, sealTenantBoundEnvelope } from "./envelope-engine.js";
import { toStoreFacingCiphertext } from "./envelope-storage.js";
import type { Keyring } from "./keyring.js";
import type { ProviderCredentialCiphertextIdentity } from "./types.js";

export function serializeProviderCredentialCiphertextAad(
  identity: ProviderCredentialCiphertextIdentity,
): Uint8Array {
  assertProviderCredentialIdentityForAad(identity);
  return serializeAadFields([
    String(RECORD_TYPE_PROVIDER_CREDENTIAL),
    identity.organizationId,
    identity.appConnectionId,
    identity.provider,
    identity.credentialId,
  ]);
}

export function providerCredentialIdentityMatches(
  left: ProviderCredentialCiphertextIdentity,
  right: ProviderCredentialCiphertextIdentity,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.appConnectionId === right.appConnectionId &&
    left.provider === right.provider &&
    left.credentialId === right.credentialId
  );
}

export interface WrappedProviderCredential {
  organizationDataKeyVersion: number;
  ciphertext: Uint8Array;
  identity?: ProviderCredentialCiphertextIdentity;
}

export async function encryptProviderCredential(
  keyring: Keyring,
  identity: ProviderCredentialCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedProviderCredential> {
  assertProviderCredentialIdentityForAad(identity);
  const activeVersions = await keyring.getActiveOrganizationDataKeyVersions(
    identity.organizationId,
  );
  const organizationDataKey = await keyring.getOrganizationDataKey(
    identity.organizationId,
    activeVersions,
  );
  const ciphertext = await sealTenantBoundEnvelope({
    recordType: RECORD_TYPE_PROVIDER_CREDENTIAL,
    tenantDataKey: organizationDataKey,
    tenantDataKeyVersion: activeVersions.organizationDataKeyVersion,
    ciphertextAad: serializeProviderCredentialCiphertextAad(identity),
    plaintextUtf8,
  });
  return {
    organizationDataKeyVersion: activeVersions.organizationDataKeyVersion,
    ciphertext,
    identity,
  };
}

/**
 * Decrypt for approved provider adapter use (Secret Sync, credential refresh).
 * Must not be used for reveal, export, or CLI/API read paths.
 */
export async function decryptProviderCredentialForProviderUse(
  keyring: Keyring,
  identity: ProviderCredentialCiphertextIdentity,
  wrapped: WrappedProviderCredential,
): Promise<PlaintextHandle> {
  if (
    wrapped.identity !== undefined &&
    !providerCredentialIdentityMatches(identity, wrapped.identity)
  ) {
    throw new DecryptError();
  }

  assertProviderCredentialIdentityForAad(identity);
  const versions = await keyring.resolveOrganizationDataKeyVersions(
    identity.organizationId,
    wrapped.organizationDataKeyVersion,
  );
  const organizationDataKey = await keyring.getOrganizationDataKey(
    identity.organizationId,
    versions,
  );

  const plaintext = await openTenantBoundEnvelope({
    recordType: RECORD_TYPE_PROVIDER_CREDENTIAL,
    envelopeBytes: wrapped.ciphertext,
    tenantDataKey: organizationDataKey,
    ciphertextAad: serializeProviderCredentialCiphertextAad(identity),
  });
  return new PlaintextHandle(plaintext);
}

export { toStoreFacingCiphertext };
