/**
 * ADR-0064/0077 keyring-construction lint boundary: decrypt-capable constructors that may only be
 * imported inside `apps/runtime/src/**` (plus `packages/crypto/src/**` for package-internal use).
 * Single source of truth for `eslint.config.ts` — add new constructors here so lint fails closed.
 */
export const KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS = [
  "SecretsStoreRootKeyProvider",
  "EnvRootKeyProvider",
  "createKeyringFromDevEnvRootKey",
  "resolveInstanceRootKeyFromEnv",
  "createKeyringFromSecretsStoreBinding",
  "createKeyringFromRootKeyProvider",
  "createKeyring",
  "StaticRootKeyProvider",
  "Keyring",
] as const;

/** Production modules that may import keyring-construction values outside `apps/runtime/src/**`. */
export const KEYRING_CONSTRUCTION_VALUE_IMPORT_ALLOWLIST = [
  "packages/tenant-keyring/src/**",
  "packages/backup-restore/src/recovery-canary.ts",
  "packages/local-store/src/**",
] as const;

/** Runtime keyring-context exports fenced outside `apps/runtime/src/**`. */
const KEYRING_CONSTRUCTION_RESTRICTED_RUNTIME_IMPORTS = [
  "createKeyringFromRuntimeEnv",
  "RuntimeEnvRootKeyProvider",
] as const;

export const KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS = [
  ...KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS,
  ...KEYRING_CONSTRUCTION_RESTRICTED_RUNTIME_IMPORTS,
] as const;

/** Crypto source modules that export decrypt-capable keyring constructors. */
const KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES = [
  "keyring",
  "secrets-store-root-key-provider",
  "crypto-runtime",
] as const;

export const KEYRING_CONSTRUCTION_SOURCE_MODULE_PATTERNS =
  KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES.flatMap((basename) => [
    `**/crypto/src/${basename}`,
    `**/crypto/src/${basename}.js`,
  ]);

export const KEYRING_CONSTRUCTION_RESTRICTED_IMPORT_NAME_PATTERN = `^(${KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS.join("|")})$`;

export const KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES_REGEX =
  KEYRING_CONSTRUCTION_SOURCE_MODULE_BASENAMES.join("|");
