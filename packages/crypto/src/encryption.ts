export type {
  ProviderCredentialCiphertextIdentity,
  ProviderConnectionMethod,
  SecretCiphertextIdentity,
  SensitiveMetadataCiphertextIdentity,
  SensitiveMetadataFieldKey,
  SensitiveMetadataType,
} from "./types.js";

export {
  decryptSecretValueForRuntime,
  encryptSecretValue,
  serializeSecretCiphertextAad,
  type WrappedSecretValue,
} from "./envelope.js";

export {
  decryptProviderCredentialForProviderUse,
  encryptProviderCredential,
  providerCredentialIdentityMatches,
  serializeProviderCredentialCiphertextAad,
  type WrappedProviderCredential,
} from "./provider-credential-envelope.js";

export {
  decryptSensitiveMetadataForAuthorizedRead,
  encryptSensitiveMetadata,
  isOrganizationScopedSensitiveMetadata,
  sensitiveMetadataIdentityMatches,
  serializeSensitiveMetadataCiphertextAad,
  type WrappedSensitiveMetadata,
} from "./sensitive-metadata-envelope.js";

export { DecryptError, InvalidAadFieldError } from "./errors.js";
