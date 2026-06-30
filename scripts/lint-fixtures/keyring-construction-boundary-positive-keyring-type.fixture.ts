/**
 * Positive lint fixture for ADR-0064/0077 Keyring type-only import boundary.
 * This file must pass `eslint` when linted directly.
 */
import type { Keyring } from "@insecur/crypto";

export type KeyringConstructionTypeOnlyProbe = Keyring;
