import { ENVELOPE_FORMAT_VERSION, RECORD_TYPE_SECRET } from "./constants.js";
import type { SecretCiphertextIdentity } from "./types.js";

const FIELD_SEPARATOR = "\u001f";

function encodeField(value: string): string {
  return value;
}

/**
 * Canonical ciphertext-layer AAD for Secret records.
 * Identity is recomputed at decrypt; it is never stored alongside ciphertext.
 */
export function serializeSecretCiphertextAad(identity: SecretCiphertextIdentity): Uint8Array {
  const parts = [
    String(RECORD_TYPE_SECRET),
    encodeField(identity.organizationId),
    encodeField(identity.projectId),
    encodeField(identity.environmentId),
    encodeField(identity.secretId),
  ];
  return new TextEncoder().encode(parts.join(FIELD_SEPARATOR));
}

/** DEK-wrap layer AAD binds format marker and project data-key version. */
export function serializeDekWrapAad(projectDataKeyVersion: number): Uint8Array {
  const parts = [
    String(RECORD_TYPE_SECRET),
    String(ENVELOPE_FORMAT_VERSION),
    String(projectDataKeyVersion),
  ];
  return new TextEncoder().encode(parts.join(FIELD_SEPARATOR));
}

export function identityMatches(
  left: SecretCiphertextIdentity,
  right: SecretCiphertextIdentity,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.secretId === right.secretId
  );
}
