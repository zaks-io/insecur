import { DecryptError } from "./errors.js";

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
  identityMatches,
  serializeSecretCiphertextAad,
  serializeSecretDekWrapAad,
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

export { DecryptError };
