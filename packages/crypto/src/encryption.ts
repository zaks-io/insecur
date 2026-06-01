import type { EnvironmentId, OrganizationId, ProjectId, SecretId } from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

/** Identity binding for ciphertext (Opaque Resource IDs only). */
export interface SecretCiphertextIdentity {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
}

/** Wrapped material returned to callers; never plaintext at rest. */
export interface WrappedSecretValue {
  keyVersion: number;
  ciphertext: Uint8Array;
  identity: SecretCiphertextIdentity;
}

/**
 * Write-path encryption for Blind Secret Write and storage.
 * Accepts plaintext only at the encryption boundary; callers must not log input.
 */
export function encryptSecretValue(
  identity: SecretCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedSecretValue> {
  void identity;
  void plaintextUtf8;
  return Promise.reject(new NotImplementedError("encryptSecretValue"));
}

/**
 * Runtime-only decrypt for approved Injection Grant consume.
 * Must not be used for reveal, export, or CLI/API read paths.
 */
export function decryptSecretValueForRuntime(
  identity: SecretCiphertextIdentity,
  wrapped: WrappedSecretValue,
): Promise<Uint8Array> {
  void identity;
  void wrapped;
  return Promise.reject(new NotImplementedError("decryptSecretValueForRuntime"));
}
