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
export { parseDbTimestamp, toEpochSeconds, toIsoTimestamp } from "./parse-db-timestamp.js";
export {
  getRuntimeTenantDb,
  resetRuntimeTenantDb,
  type TenantScopedDb,
} from "./tenant-scoped-db.js";
export {
  createTenantScopedTransaction,
  type TenantScopedTransaction,
} from "./tenant-scoped-transaction.js";
export {
  closeRuntimeSql,
  configureRuntimeConnection,
  runWithRuntimeConnection,
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
export { TenantSecretMatrixMetadataStore } from "./secrets/tenant-secret-matrix-metadata-store.js";
export type {
  ListSecretMatrixByProjectInput,
  SecretMatrixLastSetActorRow,
  SecretMatrixSecretRow,
} from "./secrets/secret-matrix-metadata-types.js";
export type {
  EnvironmentSecretMetadataRow,
  ListEnvironmentSecretsInput,
  ListSecretVersionMetadataInput,
  SecretVersionMetadataRow,
} from "./secrets/environment-secret-metadata-types.js";
export {
  SECRET_VERSION_LIFECYCLE_STATES,
  parseSecretVersionLifecycleState,
  type SecretVersionLifecycleState,
} from "./secrets/lifecycle-states.js";
export { resolveSecretForRead } from "./secrets/resolve-secret-for-read.js";
export { copyEnvironmentSecretShapes } from "./secrets/copy-environment-secret-shapes.js";
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
  AppendSecretVersionAsDraftInput,
  AppendSecretVersionAsDraftResult,
  AppendSecretVersionResult,
  DraftVersionMetadataRow,
  ListDraftVersionsInput,
  PublishSecretVersionTarget,
  PublishSecretVersionsInput,
  PublishSecretVersionsResult,
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
export {
  defaultConnectionMethodForProvider,
  DEFAULT_CONNECTION_METHOD_BY_PROVIDER,
} from "./app-connections/default-connection-method-for-provider.js";
export { TenantAppConnectionStore } from "./app-connections/tenant-app-connection-store.js";
export {
  AppConnectionStoreError,
  isAppConnectionStoreError,
  APP_CONNECTION_STORE_ERROR_CODES,
} from "./app-connections/errors.js";
export type {
  AppConnectionRow,
  AppConnectionStatus,
  AppConnectionValidationOutcome,
  AppConnectionMethod,
  AppConnectionProvider,
  CreateAppConnectionInput,
  ListAppConnectionsInput,
  UpdateAppConnectionStatusInput,
  UpdateAppConnectionValidationInput,
  AttachActiveProviderCredentialInput,
  APP_CONNECTION_STATUSES,
  APP_CONNECTION_METHODS,
  APP_CONNECTION_PROVIDERS,
  APP_CONNECTION_VALIDATION_OUTCOMES,
} from "./app-connections/types.js";
export { TenantProviderAppRegistrationStore } from "./provider-app-registrations/tenant-provider-app-registration-store.js";
export {
  ProviderAppRegistrationStoreError,
  isProviderAppRegistrationStoreError,
  PROVIDER_APP_REGISTRATION_STORE_ERROR_CODES,
} from "./provider-app-registrations/errors.js";
export type {
  ProviderAppRegistrationRow,
  ProviderAppRegistrationStatus,
  ProviderAppRegistrationMethod,
  ProviderAppRegistrationProvider,
  UpsertProviderAppRegistrationInput,
  GetProviderAppRegistrationInput,
  PROVIDER_APP_REGISTRATION_STATUSES,
  PROVIDER_APP_REGISTRATION_METHODS,
  PROVIDER_APP_REGISTRATION_PROVIDERS,
} from "./provider-app-registrations/types.js";
export { TenantSensitiveMetadataStore } from "./sensitive-metadata/tenant-sensitive-metadata-store.js";
export type {
  SensitiveMetadataFieldRow,
  StoredWrappedSensitiveMetadata,
  UpsertSensitiveMetadataInput,
} from "./sensitive-metadata/types.js";
export {
  isCliSessionRevoked,
  revokeCliSession,
} from "./cli-sessions/tenant-revoked-cli-session-store.js";
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
export { TenantProjectMetadataStore } from "./projects/tenant-project-metadata-store.js";
export type { ProjectMetadataRow } from "./projects/types.js";
export { TenantEnvironmentLifecycleStore } from "./environments/tenant-environment-lifecycle-store.js";
export { TenantHierarchyDisplayNameStore } from "./hierarchy/tenant-hierarchy-display-name-store.js";
export type {
  CreateEnvironmentLifecycleInput,
  EnvironmentLifecycleRow,
  PreviewNonProductionOptDown,
  UpdateEnvironmentLifecycleMetadataInput,
} from "./environments/types.js";
export {
  persistGuidedOrganization,
  type GuidedOrganizationResourceIds,
  type PersistGuidedOrganizationInput,
} from "./guided-organization/persist-guided-organization.js";
export { RuntimeInjectionPolicyStoreError } from "./runtime-injection-policies/errors.js";
export { TenantRuntimeInjectionPolicyStore } from "./runtime-injection-policies/tenant-runtime-injection-policy-store.js";
export {
  RUNTIME_INJECTION_DELIVERY_MODES,
  type CreateRuntimeInjectionPolicyInput,
  type PublishRuntimeInjectionPolicyVersionInput,
  type RuntimeInjectionDeliveryMode,
  type RuntimeInjectionPolicyBindingInput,
  type RuntimeInjectionPolicyRow,
  type RuntimeInjectionPolicyVersionContentInput,
  type RuntimeInjectionPolicyVersionRow,
} from "./runtime-injection-policies/types.js";
export { TenantWebhookSubscriptionStore } from "./webhooks/tenant-webhook-subscription-store.js";
export type {
  CreateWebhookSubscriptionInput,
  UpdateWebhookSubscriptionInput,
  WebhookSubscriptionRow,
  WebhookSubscriptionStatus,
} from "./webhooks/tenant-webhook-subscription-store.js";
export { TenantWebhookSigningSecretStore } from "./webhooks/tenant-webhook-signing-secret-store.js";
export type {
  UpsertWebhookSigningSecretInput,
  WebhookSigningSecretRow,
  WebhookSigningSecretStatus,
} from "./webhooks/types.js";
export { TenantInAppEventNotificationStore } from "./webhooks/tenant-in-app-event-notification-store.js";
export type { InsertInAppEventNotificationInput } from "./webhooks/tenant-in-app-event-notification-store.js";
