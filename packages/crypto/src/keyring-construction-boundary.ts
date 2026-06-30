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
] as const;

/** Runtime keyring-context exports fenced outside `apps/runtime/src/**`. */
export const KEYRING_CONSTRUCTION_RESTRICTED_RUNTIME_IMPORTS = [
  "createKeyringFromRuntimeEnv",
  "RuntimeEnvRootKeyProvider",
] as const;

export const KEYRING_CONSTRUCTION_RESTRICTED_IMPORTS = [
  ...KEYRING_CONSTRUCTION_RESTRICTED_CRYPTO_IMPORTS,
  ...KEYRING_CONSTRUCTION_RESTRICTED_RUNTIME_IMPORTS,
] as const;
