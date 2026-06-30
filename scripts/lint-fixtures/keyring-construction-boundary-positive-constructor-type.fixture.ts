/**
 * Positive lint fixture for ADR-0064/0077 constructor type-only import boundary.
 * This file must pass `eslint` when linted directly.
 */
import type { createKeyring, Keyring, StaticRootKeyProvider } from "@insecur/crypto";

export type KeyringConstructionConstructorTypeOnlyProbe = Keyring;
export type CreateKeyringTypeOnlyProbe = typeof createKeyring;
export type StaticRootKeyProviderTypeOnlyProbe = typeof StaticRootKeyProvider;
