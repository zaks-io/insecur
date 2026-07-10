export {
  MACHINE_ROOT_KEY_ACCOUNT,
  MACHINE_ROOT_KEY_BYTE_LENGTH,
  MACHINE_ROOT_KEY_DPAPI_FILE_NAME,
  MACHINE_ROOT_KEY_FILE_NAME,
  MACHINE_ROOT_KEY_HEX_LENGTH,
  MACHINE_ROOT_KEY_SERVICE,
  LOCAL_MODE_ORGANIZATION_ID_VALUE,
  LOCAL_STORE_DB_FILE_NAME,
  USER_CONFIG_DIR_NAME,
} from "./constants.js";
export type {
  LocalAuditEventInput,
  LocalAuditEventRow,
  LocalConsumedInjectionGrantRow,
  LocalEnvironmentRow,
  LocalInsertInjectionGrantInput,
  LocalProjectRow,
  LocalReplaceCurrentVersionInput,
  LocalResolvedInjectionGrantBinding,
  LocalSecretMetadataRow,
  LocalSecretShapeRow,
  LocalSecretVersionRow,
  LocalStoredWrappedSecretMaterial,
  LocalUpsertSecretShapeInput,
} from "./contracts/types.js";
export type { LocalAuditWriter } from "./contracts/audit-writer.js";
export type { LocalInjectionGrantStore } from "./contracts/injection-grant-store.js";
export type { LocalProjectMetadataStore } from "./contracts/project-metadata-store.js";
export type { LocalSecretVersionStore } from "./contracts/secret-version-store.js";
export {
  createLocalStore,
  createLocalStoreForTest,
  type CreateLocalStoreOptions,
  type LocalStore,
} from "./create-local-store.js";
export { decryptLocalSecretForInjection } from "./decrypt-local-secret-for-injection.js";
export { encryptLocalSecretValue } from "./crypto/encrypt-local-secret.js";
export { LOCAL_MODE_ORGANIZATION_ID } from "./crypto/local-organization.js";
export { createLocalKeyring } from "./crypto/local-keyring.js";
export { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";
export { createFakeKeyStore } from "./fake-key-store.js";
export { createKeyStore, createKeyStoreFromAdapter } from "./key-store.js";
export {
  assertMachineRootKeyHex,
  bytesToMachineRootKeyHex,
  generateMachineRootKeyHex,
} from "./machine-root-key.js";
export { FILE_FALLBACK_NOTICE } from "./notices.js";
export { SEALED_RECORD_V1_PREFIX, sealLocalRecord, unsealLocalRecord } from "./sealed-record.js";
export { resolveKeyStorePaths, resolveLocalStorePaths, resolveUserConfigHome } from "./paths.js";
export {
  INSECURE_FILE_KEY_STORE_ENV,
  isLinuxSecretToolAvailable,
  resolveKeyStoreBackend,
} from "./resolve-backend.js";
export type {
  CreateKeyStoreOptions,
  ExecFileFn,
  ExecFileOptions,
  ExecFileResult,
  KeyStore,
  KeyStoreAdapter,
  KeyStoreBackend,
  KeyStoreDependencies,
  KeyStoreNotice,
  KeyStorePaths,
  LocalStorePaths,
} from "./types.js";
export { createDefaultExecFile, DEFAULT_EXEC_FILE_TIMEOUT_MS } from "./exec-file.js";
export { createFileFallbackAdapter, writePrivateKeyFile } from "./adapters/file-fallback.js";
export { createLinuxSecretToolAdapter } from "./adapters/linux-secret-tool.js";
export { createMacosKeychainAdapter } from "./adapters/macos-keychain.js";
export { createWindowsDpapiAdapter } from "./adapters/windows-dpapi.js";
export {
  writeLocalBlindSecretVersion,
  type WriteLocalBlindSecretVersionInput,
  type WriteLocalBlindSecretVersionResult,
} from "./write-local-blind-secret-version.js";
