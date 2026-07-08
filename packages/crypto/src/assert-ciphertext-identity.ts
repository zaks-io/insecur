import {
  assertOpaqueResourceIdForAad,
  assertOpaqueResourceIdFieldForAad,
  assertProviderConnectionMethodForAad,
  assertSensitiveMetadataFieldKeyForAad,
  assertSensitiveMetadataTypeForAad,
} from "./aad-field-validation.js";
import type {
  ProviderCredentialCiphertextIdentity,
  SecretCiphertextIdentity,
  SensitiveMetadataCiphertextIdentity,
} from "./types.js";

export function assertSecretIdentityForAad(identity: SecretCiphertextIdentity): void {
  assertOpaqueResourceIdFieldForAad(identity.organizationId, "org", "organizationId");
  assertOpaqueResourceIdFieldForAad(identity.projectId, "prj", "projectId");
  assertOpaqueResourceIdFieldForAad(identity.environmentId, "env", "environmentId");
  assertOpaqueResourceIdFieldForAad(identity.secretId, "sec", "secretId");
}

const WEBHOOK_SIGNING_SECRET_PROVIDER = "webhook-signing-secret";

export function assertProviderCredentialIdentityForAad(
  identity: ProviderCredentialCiphertextIdentity,
): void {
  assertProviderConnectionMethodForAad(identity.provider);
  assertOpaqueResourceIdFieldForAad(identity.organizationId, "org", "organizationId");
  if (identity.provider === WEBHOOK_SIGNING_SECRET_PROVIDER) {
    // Webhook signing secrets reuse the provider-credential envelope; subscription id
    // occupies the appConnectionId AAD slot and signing secret id occupies credentialId.
    assertOpaqueResourceIdFieldForAad(identity.appConnectionId, "whsub", "appConnectionId");
    assertOpaqueResourceIdFieldForAad(identity.credentialId, "whsec", "credentialId");
    return;
  }
  assertOpaqueResourceIdFieldForAad(identity.appConnectionId, "conn", "appConnectionId");
  assertOpaqueResourceIdFieldForAad(identity.credentialId, "pcred", "credentialId");
}

export function assertSensitiveMetadataIdentityForAad(
  identity: SensitiveMetadataCiphertextIdentity,
): void {
  assertSensitiveMetadataTypeForAad(identity.metadataType);
  assertOpaqueResourceIdForAad(identity.recordResourceId);
  assertSensitiveMetadataFieldKeyForAad(identity.fieldKey);
}
