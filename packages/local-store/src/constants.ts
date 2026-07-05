/** Stable macOS Keychain / Linux secret-tool service name for the machine root key. */
export const MACHINE_ROOT_KEY_SERVICE = "insecur";

/** Stable account name for the machine root key across OS keystores. */
export const MACHINE_ROOT_KEY_ACCOUNT = "machine-root-key-v1";

/** Instance root key hex length (32 bytes). Matches `@insecur/crypto` conventions. */
export const MACHINE_ROOT_KEY_HEX_LENGTH = 64;

export const MACHINE_ROOT_KEY_BYTE_LENGTH = 32;

/** Relative path under the insecur user config directory for the file-fallback key. */
export const MACHINE_ROOT_KEY_FILE_NAME = "machine-root-key";

/** Relative path under the insecur user config directory for the Windows DPAPI blob. */
export const MACHINE_ROOT_KEY_DPAPI_FILE_NAME = "machine-root-key.dpapi";

export const USER_CONFIG_DIR_NAME = ".insecur";
