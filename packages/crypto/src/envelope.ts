import { toBufferSource } from "./buffer.js";
import { ENVELOPE_FORMAT_VERSION, GCM_IV_LENGTH, RECORD_TYPE_SECRET } from "./constants.js";
import { getKeyring } from "./crypto-runtime.js";
import { DecryptError } from "./errors.js";
import {
  ENVELOPE_HEADER_LENGTH,
  parseEnvelopeLayout,
  writeEnvelopeHeader,
} from "./envelope-layout.js";
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

function randomIv(): Uint8Array {
  const iv = new Uint8Array(GCM_IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

async function aesGcmEncrypt(
  key: CryptoKey,
  iv: Uint8Array,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(iv),
      additionalData: toBufferSource(additionalData),
    },
    key,
    toBufferSource(plaintext),
  );
  return new Uint8Array(ciphertext);
}

async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(iv),
      additionalData: toBufferSource(additionalData),
    },
    key,
    toBufferSource(ciphertext),
  );
  return new Uint8Array(plaintext);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

interface SealSecretValueInput {
  identity: SecretCiphertextIdentity;
  plaintextUtf8: Uint8Array;
  projectDataKey: CryptoKey;
  projectDataKeyVersion: number;
}

async function sealSecretValue(input: SealSecretValueInput): Promise<Uint8Array> {
  const dek = new Uint8Array(32);
  crypto.getRandomValues(dek);
  const dekKey = await crypto.subtle.importKey("raw", toBufferSource(dek), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

  const dekWrapIv = randomIv();
  const valueIv = randomIv();
  const wrappedDek = await aesGcmEncrypt(
    input.projectDataKey,
    dekWrapIv,
    dek,
    serializeDekWrapAad(input.projectDataKeyVersion),
  );
  const valueCiphertext = await aesGcmEncrypt(
    dekKey,
    valueIv,
    input.plaintextUtf8,
    serializeSecretCiphertextAad(input.identity),
  );

  const header = writeEnvelopeHeader({
    projectDataKeyVersion: input.projectDataKeyVersion,
    dekWrapIv,
    wrappedDekLength: wrappedDek.byteLength,
    valueIv,
    valueCiphertextLength: valueCiphertext.byteLength,
  });
  return concatBytes(header, wrappedDek, valueCiphertext);
}

interface OpenSecretValueInput {
  identity: SecretCiphertextIdentity;
  envelopeBytes: Uint8Array;
  projectDataKey: CryptoKey;
}

async function decryptParsedEnvelope(
  layout: ReturnType<typeof parseEnvelopeLayout>,
  identity: SecretCiphertextIdentity,
  projectDataKey: CryptoKey,
): Promise<Uint8Array> {
  const dekBytes = await aesGcmDecrypt(
    projectDataKey,
    layout.dekWrapIv,
    layout.wrappedDek,
    serializeDekWrapAad(layout.projectDataKeyVersion),
  );
  const dekKey = await crypto.subtle.importKey("raw", toBufferSource(dekBytes), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return aesGcmDecrypt(
    dekKey,
    layout.valueIv,
    layout.valueCiphertext,
    serializeSecretCiphertextAad(identity),
  );
}

async function openSecretValue(input: OpenSecretValueInput): Promise<Uint8Array> {
  try {
    const layout = parseEnvelopeLayout(input.envelopeBytes);
    return await decryptParsedEnvelope(layout, input.identity, input.projectDataKey);
  } catch (error) {
    if (error instanceof DecryptError) {
      throw error;
    }
    throw new DecryptError();
  }
}

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

/** Bytes persisted by the Secret Version Store (no caller identity echo). */
export function toStoreFacingCiphertext(wrapped: { ciphertext: Uint8Array }): Uint8Array {
  return wrapped.ciphertext;
}

export { ENVELOPE_HEADER_LENGTH };
