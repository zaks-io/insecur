export { isUniqueConstraintViolation } from "./is-unique-constraint-violation.js";
export {
  type TenantScope,
  type OrganizationTenantScope,
  type ServiceTenantScope,
  type TenantScopedCallback,
  withTenantScope,
} from "./with-tenant-scope.js";
export type { TenantScopedSql } from "./tenant-scoped-sql.js";
export { closeRuntimeSql, RuntimeConfigMissingError } from "./db/connection.js";
export {
  DATA_KEY_VERSION_STATUSES,
  type DataKeyVersionStatus,
  type OrganizationDataKeyRow,
  type ProjectDataKeyRow,
  type SeedOrganizationDataKeyInput,
  type SeedProjectDataKeyInput,
} from "./data-keys/types.js";
export { TenantDataKeyMetadataStore } from "./data-keys/tenant-data-key-metadata-store.js";
export {
  decodeInlineCiphertextStorageRef,
  encodeInlineCiphertextStorageRef,
  INLINE_CIPHERTEXT_STORAGE_PREFIX,
} from "./secrets/ciphertext-storage-ref.js";
export {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
} from "./secrets/errors.js";
export { TenantSecretVersionStore } from "./secrets/tenant-secret-version-store.js";
export { resolveSecretForRead } from "./secrets/resolve-secret-for-read.js";
export type {
  ResolveSecretForReadInput,
  ResolvedSecretForRead,
} from "./secrets/resolve-secret-for-read-types.js";
export {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
} from "./injection-grants/assert-project-environment-coordinate.js";
export {
  TenantInjectionGrantStore,
  type ConsumedInjectionGrantRow,
  type InjectionGrantConsumeFailure,
} from "./injection-grants/tenant-injection-grant-store.js";
export type {
  InsertInjectionGrantInput,
  InjectionGrantRow,
  ResolvedInjectionGrantBinding,
} from "./injection-grants/types.js";
export type {
  AppendSecretVersionAndMakeLiveInput,
  AppendSecretVersionAndMakeLiveResult,
  ResolveSecretForWriteInput,
  SecretVersionStoreRow,
  StoredWrappedSecretMaterial,
} from "./secrets/types.js";
export { TenantProviderCredentialStore } from "./provider-credentials/tenant-provider-credential-store.js";
export type {
  ProviderCredentialRow,
  StoredWrappedProviderCredential,
  UpsertProviderCredentialInput,
} from "./provider-credentials/types.js";
export { TenantSensitiveMetadataStore } from "./sensitive-metadata/tenant-sensitive-metadata-store.js";
export type {
  SensitiveMetadataFieldRow,
  StoredWrappedSensitiveMetadata,
  UpsertSensitiveMetadataInput,
} from "./sensitive-metadata/types.js";
export { EnvironmentLifecycleStoreError } from "./environments/errors.js";
export { resolveEnvironmentProtection } from "./environments/resolve-environment-protection.js";
export { TenantEnvironmentLifecycleStore } from "./environments/tenant-environment-lifecycle-store.js";
export type {
  CreateEnvironmentLifecycleInput,
  EnvironmentLifecycleRow,
  PreviewNonProductionOptDown,
  UpdateEnvironmentLifecycleMetadataInput,
} from "./environments/types.js";
