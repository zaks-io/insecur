import { assertProviderCredentialIdentityForAad } from "./assert-ciphertext-identity.js";
import {
  RECORD_TYPE_PROVIDER_CREDENTIAL,
  SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
} from "./constants.js";
import { DecryptError } from "./errors.js";
import { PlaintextHandle } from "./plaintext-handle.js";
import { serializeAadFields } from "./envelope-aad.js";
import {
  openTenantBoundEnvelope,
  sealTenantBoundEnvelope,
  type DekWrapTenantCoordinate,
} from "./envelope-engine.js";
import type { Keyring } from "./keyring.js";
import type { ProviderCredentialCiphertextIdentity } from "./types.js";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";

export type { WrappedProviderCredential } from "@insecur/custody-contracts";

function providerCredentialDekWrapTenantCoordinate(
  identity: ProviderCredentialCiphertextIdentity,
): DekWrapTenantCoordinate {
  return {
    organizationId: identity.organizationId,
    scopeProjectId: SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
  };
}

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
    dekWrapTenantCoordinate: providerCredentialDekWrapTenantCoordinate(identity),
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
    dekWrapTenantCoordinate: providerCredentialDekWrapTenantCoordinate(identity),
    ciphertextAad: serializeProviderCredentialCiphertextAad(identity),
  });
  return new PlaintextHandle(plaintext);
}
