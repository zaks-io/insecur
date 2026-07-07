/** Stable macOS Keychain / Linux secret-tool service name for the machine root key. */
export const MACHINE_ROOT_KEY_SERVICE = "insecur";

/** Stable account name for the machine root key across OS keystores. */
export const MACHINE_ROOT_KEY_ACCOUNT = "machine-root-key-v1";

/** Machine-local root key hex length (32 bytes). Matches `@insecur/crypto` instance root key shape. */
export const MACHINE_ROOT_KEY_HEX_LENGTH = 64;

export const MACHINE_ROOT_KEY_BYTE_LENGTH = 32;

/** Relative path under the insecur user config directory for the file-fallback key. */
export const MACHINE_ROOT_KEY_FILE_NAME = "machine-root-key";

/** Relative path under the insecur user config directory for the Windows DPAPI blob. */
export const MACHINE_ROOT_KEY_DPAPI_FILE_NAME = "machine-root-key.dpapi";

/** Cross-process lock file used during first-run machine root key creation. */
export const MACHINE_ROOT_KEY_CREATE_LOCK_FILE_NAME = ".machine-root-key-v1.create.lock";

export const USER_CONFIG_DIR_NAME = ".insecur";

/** Single-file SQLite store for Local Mode secret metadata and wrapped Current Versions. */
export const LOCAL_STORE_DB_FILE_NAME = "local-store.sqlite";

/**
 * Machine-scoped organization sentinel for Local Mode ciphertext identity binding.
 * Local Mode has no Organization object; this fixed id preserves the hosted envelope seam.
 */
export const LOCAL_MODE_ORGANIZATION_ID_VALUE = "org_00000000000000000000000001";

/** Initial local-mode key versions (mirror hosted defaults). */
export const LOCAL_DEFAULT_ROOT_KEY_VERSION = 1;
export const LOCAL_DEFAULT_ORGANIZATION_DATA_KEY_VERSION = 1;
export const LOCAL_DEFAULT_PROJECT_DATA_KEY_VERSION = 1;
