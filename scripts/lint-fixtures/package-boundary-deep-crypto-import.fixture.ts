// Negative probe for package-boundary conformance (INS-224).
// Deep workspace imports must normalize to the root package before graph comparison.
import type { Keyring } from "@insecur/crypto/src/keyring.js";

export type PackageBoundaryDeepCryptoImportProbe = Keyring;
