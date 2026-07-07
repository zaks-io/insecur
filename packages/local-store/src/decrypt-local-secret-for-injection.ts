import {
  decryptSecretValueForRuntime,
  type Keyring,
  type PlaintextHandle,
  type SecretCiphertextIdentity,
} from "@insecur/crypto";

import type { LocalStoredWrappedSecretMaterial } from "./contracts/types.js";

/**
 * Runtime-only decrypt for Local Mode `run` injection.
 * Must not be used for reveal, export, or CLI/API read paths (ADR-0071).
 */
export async function decryptLocalSecretForInjection(
  keyring: Keyring,
  identity: SecretCiphertextIdentity,
  wrapped: LocalStoredWrappedSecretMaterial,
): Promise<PlaintextHandle> {
  return decryptSecretValueForRuntime(keyring, identity, wrapped);
}
