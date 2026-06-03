import { RECORD_TYPE_PROVIDER_CREDENTIAL } from "./constants.js";
import { getKeyring } from "./crypto-runtime.js";
import { DecryptError } from "./errors.js";
import { serializeAadFields } from "./envelope-aad.js";
import { openTenantBoundEnvelope, sealTenantBoundEnvelope } from "./envelope-engine.js";
import { toStoreFacingCiphertext } from "./envelope-storage.js";
import type { ProviderCredentialCiphertextIdentity } from "./types.js";

export function serializeProviderCredentialCiphertextAad(
  identity: ProviderCredentialCiphertextIdentity,
): Uint8Array {
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
  identity: ProviderCredentialCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedProviderCredential> {
  const keyring = getKeyring();
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
  identity: ProviderCredentialCiphertextIdentity,
  wrapped: WrappedProviderCredential,
): Promise<Uint8Array> {
  if (
    wrapped.identity !== undefined &&
    !providerCredentialIdentityMatches(identity, wrapped.identity)
  ) {
    throw new DecryptError();
  }

  const keyring = getKeyring();
  const versions = await keyring.resolveOrganizationDataKeyVersions(
    identity.organizationId,
    wrapped.organizationDataKeyVersion,
  );
  const organizationDataKey = await keyring.getOrganizationDataKey(
    identity.organizationId,
    versions,
  );

  return openTenantBoundEnvelope({
    recordType: RECORD_TYPE_PROVIDER_CREDENTIAL,
    envelopeBytes: wrapped.ciphertext,
    tenantDataKey: organizationDataKey,
    ciphertextAad: serializeProviderCredentialCiphertextAad(identity),
  });
}

export { toStoreFacingCiphertext };
