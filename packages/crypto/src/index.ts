export {
  type ProviderCredentialCiphertextIdentity,
  type ProviderConnectionMethod,
  type SecretCiphertextIdentity,
  type SensitiveMetadataCiphertextIdentity,
  type SensitiveMetadataFieldKey,
  type SensitiveMetadataType,
  type WrappedProviderCredential,
  type WrappedSecretValue,
  type WrappedSensitiveMetadata,
  decryptProviderCredentialForProviderUse,
  decryptSecretValueForRuntime,
  decryptSensitiveMetadataForAuthorizedRead,
  encryptProviderCredential,
  encryptSecretValue,
  encryptSensitiveMetadata,
  isOrganizationScopedSensitiveMetadata,
  providerCredentialIdentityMatches,
  sensitiveMetadataIdentityMatches,
  serializeProviderCredentialCiphertextAad,
  serializeSecretCiphertextAad,
  serializeSensitiveMetadataCiphertextAad,
  DecryptError,
  InvalidAadFieldError,
} from "./encryption.js";
export {
  RECORD_TYPE_PROVIDER_CREDENTIAL,
  RECORD_TYPE_SECRET,
  RECORD_TYPE_SENSITIVE_METADATA,
  SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
} from "./constants.js";
export {
  DATA_KEY_VERSION_STATUSES,
  type DataKeyVersionStatus,
  isDataKeyVersionStatus,
} from "./data-key-lifecycle.js";
export {
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataReader,
} from "./data-key-metadata.js";
export {
  type ActiveDataKeyVersions,
  type DataKeyVersions,
  type OrganizationDataKeyVersions,
  createKeyring,
  DefaultTenantDataKeySource,
  Keyring,
  type KeyVersion,
  type RootKeyProvider,
  StaticRootKeyProvider,
  type TenantDataKeySource,
} from "./keyring.js";
export {
  assertTenantDataKeyReadiness,
  checkTenantDataKeyReadiness,
  type DataKeyReadinessIssue,
  type DataKeyReadinessIssueCode,
  type DataKeyReadinessReport,
  type DataKeyReadinessStatus,
  type KeyringReadinessInput,
} from "./keyring-readiness.js";
export { MetadataTenantDataKeySource } from "./metadata-tenant-data-key-source.js";
export {
  createKeyringFromRootKeyProvider,
  createKeyringFromSecretsStoreBinding,
  SecretsStoreRootKeyProvider,
  type SecretsStoreSecretBinding,
} from "./secrets-store-root-key-provider.js";
export {
  INSTANCE_ROOT_KEY_BYTE_LENGTH,
  INSTANCE_ROOT_KEY_HEX_LENGTH,
  parseInstanceRootKeyHex,
  tryParseInstanceRootKeyHex,
} from "./root-key-material.js";
export { RootKeyNotConfiguredError, TenantDataKeyNotReadyError } from "./errors.js";
export { configureKeyring, getKeyring, resetKeyringForTests } from "./crypto-runtime.js";
export { toStoreFacingCiphertext } from "./envelope-storage.js";
