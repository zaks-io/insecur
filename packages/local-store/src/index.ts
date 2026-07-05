export {
  MACHINE_ROOT_KEY_ACCOUNT,
  MACHINE_ROOT_KEY_BYTE_LENGTH,
  MACHINE_ROOT_KEY_DPAPI_FILE_NAME,
  MACHINE_ROOT_KEY_FILE_NAME,
  MACHINE_ROOT_KEY_HEX_LENGTH,
  MACHINE_ROOT_KEY_SERVICE,
  USER_CONFIG_DIR_NAME,
} from "./constants.js";
export { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";
export { createFakeKeyStore } from "./fake-key-store.js";
export { createKeyStore, createKeyStoreFromAdapter } from "./key-store.js";
export {
  assertMachineRootKeyHex,
  bytesToMachineRootKeyHex,
  generateMachineRootKeyHex,
} from "./machine-root-key.js";
export { FILE_FALLBACK_NOTICE } from "./notices.js";
export { resolveKeyStorePaths, resolveUserConfigHome } from "./paths.js";
export { isLinuxSecretToolAvailable, resolveKeyStoreBackend } from "./resolve-backend.js";
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
} from "./types.js";
export { createDefaultExecFile } from "./exec-file.js";
export { createFileFallbackAdapter, writePrivateKeyFile } from "./adapters/file-fallback.js";
export { createLinuxSecretToolAdapter } from "./adapters/linux-secret-tool.js";
export { createMacosKeychainAdapter } from "./adapters/macos-keychain.js";
export { createWindowsDpapiAdapter } from "./adapters/windows-dpapi.js";
