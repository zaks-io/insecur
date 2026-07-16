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

/**
 * Migrate-only decrypt for the Local Mode → cloud reconcile (ADR-0080). The plaintext may leave
 * the process solely as the request body of the possession-check and blind-write routes; never
 * into CLI output, JSON, logs, or operation records. Not a reveal or export path (ADR-0071).
 */
export async function decryptLocalSecretForMigration(
  keyring: Keyring,
  identity: SecretCiphertextIdentity,
  wrapped: LocalStoredWrappedSecretMaterial,
): Promise<PlaintextHandle> {
  return decryptSecretValueForRuntime(keyring, identity, wrapped);
}
