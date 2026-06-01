import { getKeyring } from "./crypto-runtime.js";
import { DecryptError } from "./errors.js";
import { openSecretValue, sealSecretValue } from "./envelope.js";
import { identityMatches } from "./identity-binding.js";
import type { SecretCiphertextIdentity } from "./types.js";

export type { SecretCiphertextIdentity } from "./types.js";

/** Wrapped material returned to callers; never plaintext at rest. */
export interface WrappedSecretValue {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number;
  ciphertext: Uint8Array;
  /**
   * Optional encrypt-path echo. Persisted Secret Version rows store only
   * key-version columns and ciphertext bytes.
   */
  identity?: SecretCiphertextIdentity;
}

/**
 * Write-path encryption for Blind Secret Write and storage.
 * Accepts plaintext only at the encryption boundary; callers must not log input.
 */
export async function encryptSecretValue(
  identity: SecretCiphertextIdentity,
  plaintextUtf8: Uint8Array,
): Promise<WrappedSecretValue> {
  const keyring = getKeyring();
  const activeVersions = await keyring.getActiveDataKeyVersions(
    identity.organizationId,
    identity.projectId,
  );
  const projectDataKey = await keyring.getProjectDataKey(
    identity.organizationId,
    identity.projectId,
    activeVersions,
  );
  const ciphertext = await sealSecretValue({
    identity,
    plaintextUtf8,
    projectDataKey,
    projectDataKeyVersion: activeVersions.projectDataKeyVersion,
  });
  return {
    organizationDataKeyVersion: activeVersions.organizationDataKeyVersion,
    projectDataKeyVersion: activeVersions.projectDataKeyVersion,
    ciphertext,
    identity,
  };
}

/**
 * Runtime-only decrypt for approved Injection Grant consume.
 * Must not be used for reveal, export, or CLI/API read paths.
 */
export async function decryptSecretValueForRuntime(
  identity: SecretCiphertextIdentity,
  wrapped: WrappedSecretValue,
): Promise<Uint8Array> {
  if (wrapped.identity !== undefined && !identityMatches(identity, wrapped.identity)) {
    throw new DecryptError();
  }

  const keyring = getKeyring();
  const projectDataKey = await keyring.getProjectDataKey(
    identity.organizationId,
    identity.projectId,
    {
      organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
      projectDataKeyVersion: wrapped.projectDataKeyVersion,
    },
  );

  return openSecretValue({
    identity,
    envelopeBytes: wrapped.ciphertext,
    projectDataKey,
  });
}

export { DecryptError };
