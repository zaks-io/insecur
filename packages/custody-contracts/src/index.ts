export {
  DATA_KEY_VERSION_STATUSES,
  type DataKeyVersionStatus,
  assertDataKeyStatusTransition,
  canRetireRootKeyBinding,
  isDataKeyVersionStatus,
  statusAfterRootRewrap,
} from "./data-key-lifecycle.js";
export {
  type KeyVersion,
  type OrganizationDataKeyMetadata,
  type ProjectDataKeyMetadata,
  type TenantDataKeyMetadataProvisioner,
  type TenantDataKeyMetadataReader,
} from "./data-key-metadata.js";
export { type TenantDataKeyRewrapStore } from "./data-key-rewrap-store.js";
export { TenantDataKeyNotReadyError } from "./errors.js";
export {
  type ProviderConnectionMethod,
  type ProviderCredentialCiphertextIdentity,
  type SecretCiphertextIdentity,
  type SensitiveMetadataCiphertextIdentity,
  type SensitiveMetadataFieldKey,
  type SensitiveMetadataType,
  type StoreFacingCiphertext,
  type WrappedProviderCredential,
  type WrappedSecretValue,
  type WrappedSensitiveMetadata,
  toStoreFacingCiphertext,
} from "./wrapped-material.js";
