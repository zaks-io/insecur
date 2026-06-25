export { isUniqueConstraintViolation } from "./is-unique-constraint-violation.js";
export {
  type TenantScope,
  type OrganizationTenantScope,
  type ServiceTenantScope,
  type TenantScopedCallback,
  type TenantScopedHandles,
  withTenantScope,
} from "./with-tenant-scope.js";
export type { TenantScopedSql } from "./tenant-scoped-sql.js";
export { bindJsonb } from "./bind-jsonb.js";
export { toIsoTimestamp } from "./parse-db-timestamp.js";
export {
  getRuntimeTenantDb,
  resetRuntimeTenantDb,
  tenantScopedSql,
  type TenantScopedDb,
} from "./tenant-scoped-db.js";
export {
  closeRuntimeSql,
  configureRuntimeConnection,
  RuntimeConfigMissingError,
} from "./db/connection.js";
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
  createTenantBackedKeyring,
  createTenantBackedKeyringFromAccess,
} from "./data-keys/create-tenant-backed-keyring.js";
export {
  createTenantDataKeyMetadataAccess,
  TenantScopedDataKeyMetadataAccess,
} from "./data-keys/tenant-scoped-data-key-metadata.js";
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
  assertProjectEnvironmentCoordinateWithScope,
  type AssertProjectEnvironmentCoordinateWithScopeOptions,
  type ProjectEnvironmentCoordinate,
} from "./injection-grants/assert-project-environment-coordinate-with-scope.js";
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
export {
  insertActiveUserAdmissionInTransaction,
  resolveActiveUserAdmission,
  resolveAdmittedUserId,
  revokeUserAdmission,
  seedActiveUserAdmission,
} from "./user-admissions/tenant-user-admission-store.js";
export type {
  ActiveUserAdmissionRow,
  SeedUserAdmissionInput,
  UserAdmissionStatus,
} from "./user-admissions/types.js";
export { USER_ADMISSION_STATUSES } from "./user-admissions/types.js";
export { EnvironmentLifecycleStoreError } from "./environments/errors.js";
export { resolveEnvironmentProtection } from "./environments/resolve-environment-protection.js";
export {
  ENVIRONMENT_LIFECYCLE_IMMUTABLE_DB_MESSAGE,
  isEnvironmentLifecycleImmutableViolation,
  rethrowEnvironmentLifecycleDbError,
} from "./environments/rethrow-environment-lifecycle-db-error.js";
export { TenantEnvironmentLifecycleStore } from "./environments/tenant-environment-lifecycle-store.js";
export type {
  CreateEnvironmentLifecycleInput,
  EnvironmentLifecycleRow,
  PreviewNonProductionOptDown,
  UpdateEnvironmentLifecycleMetadataInput,
} from "./environments/types.js";
