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
export { PlaintextHandle } from "./plaintext-handle.js";
export {
  DEFAULT_ROOT_KEY_VERSION,
  RECORD_TYPE_PROVIDER_CREDENTIAL,
  RECORD_TYPE_SECRET,
  RECORD_TYPE_SENSITIVE_METADATA,
  SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL,
} from "./constants.js";
export {
  DATA_KEY_VERSION_STATUSES,
  type DataKeyVersionStatus,
  isDataKeyVersionStatus,
  canRetireRootKeyBinding,
  statusAfterRootRewrap,
} from "./data-key-lifecycle.js";
export {
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataProvisioner,
  type TenantDataKeyMetadataReader,
} from "./data-key-metadata.js";
export {
  type ActiveDataKeyVersions,
  type DataKeyVersions,
  type OrganizationDataKeyVersions,
  createKeyring,
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  Keyring,
  type KeyVersion,
  type RootKeyProvider,
  StaticRootKeyProvider,
  type TenantDataKeyRewrapStore,
  type TenantDataKeySource,
  WrappedDefaultTenantDataKeySource,
} from "./keyring.js";
export {
  mintOrganizationDataKey,
  mintProjectDataKey,
  rewrapOrganizationDataKeyStorageRef,
  rewrapProjectDataKeyStorageRef,
  unwrapOrganizationDataKeyBytes,
  unwrapProjectDataKeyBytes,
  wrapOrganizationDataKeyBytes,
  wrapProjectDataKeyBytes,
} from "./data-key-wrap.js";
export { rewrapTenantDataKeys, type RewrapTenantDataKeysInput } from "./data-key-rewrap.js";
export {
  decodeInlineWrappedDataKeyStorageRef,
  encodeInlineWrappedDataKeyStorageRef,
  INLINE_WRAPPED_DATA_KEY_STORAGE_PREFIX,
} from "./wrapped-data-key-storage-ref.js";
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
export { PersistingMetadataTenantDataKeySource } from "./persisting-metadata-tenant-data-key-source.js";
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
export { requireKeyring } from "./crypto-runtime.js";
export { toStoreFacingCiphertext } from "./envelope-storage.js";
