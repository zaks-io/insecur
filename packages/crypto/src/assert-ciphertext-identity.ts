import {
  assertProviderConnectionMethodForAad,
  assertSensitiveMetadataFieldKeyForAad,
  assertSensitiveMetadataTypeForAad,
} from "./aad-field-validation.js";
import type {
  ProviderCredentialCiphertextIdentity,
  SensitiveMetadataCiphertextIdentity,
} from "./types.js";

export function assertProviderCredentialIdentityForAad(
  identity: ProviderCredentialCiphertextIdentity,
): void {
  assertProviderConnectionMethodForAad(identity.provider);
}

export function assertSensitiveMetadataIdentityForAad(
  identity: SensitiveMetadataCiphertextIdentity,
): void {
  assertSensitiveMetadataTypeForAad(identity.metadataType);
  assertSensitiveMetadataFieldKeyForAad(identity.fieldKey);
}
