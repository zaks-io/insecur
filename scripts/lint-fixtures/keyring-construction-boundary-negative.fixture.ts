/**
 * Negative lint fixture for ADR-0064/0077 keyring-construction boundary. This file must fail `eslint`
 * when linted directly. See keyring-construction-boundary.test.ts.
 */
import {
  createKeyring,
  createKeyringFromRootKeyProvider,
  createKeyringFromSecretsStoreBinding,
  StaticRootKeyProvider,
} from "@insecur/crypto";

export function unallowlistedKeyringConstructionImports(): {
  createKeyring: typeof createKeyring;
  createKeyringFromRootKeyProvider: typeof createKeyringFromRootKeyProvider;
  createKeyringFromSecretsStoreBinding: typeof createKeyringFromSecretsStoreBinding;
  StaticRootKeyProvider: typeof StaticRootKeyProvider;
} {
  return {
    createKeyring,
    createKeyringFromRootKeyProvider,
    createKeyringFromSecretsStoreBinding,
    StaticRootKeyProvider,
  };
}
