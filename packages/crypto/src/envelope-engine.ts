import { ENVELOPE_FORMAT_VERSION } from "./constants.js";
import { DecryptError } from "./errors.js";
import { serializeAadFields } from "./envelope-aad.js";
import { aesGcmDecrypt, aesGcmEncrypt, concatBytes, randomIv } from "./envelope-crypto.js";
import { toBufferSource } from "./buffer.js";
import { parseEnvelopeLayout, writeEnvelopeHeader } from "./envelope-layout.js";

/** Tenant coordinate bound into DEK-wrap AAD (org id; project id or org-scope sentinel). */
export interface DekWrapTenantCoordinate {
  readonly organizationId: string;
  readonly scopeProjectId: string;
}

export function serializeDekWrapAad(
  recordType: number,
  tenantDataKeyVersion: number,
  tenantCoordinate: DekWrapTenantCoordinate,
): Uint8Array {
  return serializeAadFields([
    String(recordType),
    String(ENVELOPE_FORMAT_VERSION),
    String(tenantDataKeyVersion),
    tenantCoordinate.organizationId,
    tenantCoordinate.scopeProjectId,
  ]);
}

export interface SealTenantBoundEnvelopeInput {
  recordType: number;
  tenantDataKey: CryptoKey;
  tenantDataKeyVersion: number;
  dekWrapTenantCoordinate: DekWrapTenantCoordinate;
  ciphertextAad: Uint8Array;
  plaintextUtf8: Uint8Array;
}

export async function sealTenantBoundEnvelope(
  input: SealTenantBoundEnvelopeInput,
): Promise<Uint8Array> {
  const dek = new Uint8Array(32);
  crypto.getRandomValues(dek);
  const dekKey = await crypto.subtle.importKey("raw", toBufferSource(dek), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

  const dekWrapIv = randomIv();
  const valueIv = randomIv();
  const wrappedDek = await aesGcmEncrypt(
    input.tenantDataKey,
    dekWrapIv,
    dek,
    serializeDekWrapAad(
      input.recordType,
      input.tenantDataKeyVersion,
      input.dekWrapTenantCoordinate,
    ),
  );
  const valueCiphertext = await aesGcmEncrypt(
    dekKey,
    valueIv,
    input.plaintextUtf8,
    input.ciphertextAad,
  );

  const header = writeEnvelopeHeader({
    recordType: input.recordType,
    tenantDataKeyVersion: input.tenantDataKeyVersion,
    dekWrapIv,
    wrappedDekLength: wrappedDek.byteLength,
    valueIv,
    valueCiphertextLength: valueCiphertext.byteLength,
  });
  return concatBytes(header, wrappedDek, valueCiphertext);
}

export interface OpenTenantBoundEnvelopeInput {
  recordType: number;
  envelopeBytes: Uint8Array;
  tenantDataKey: CryptoKey;
  dekWrapTenantCoordinate: DekWrapTenantCoordinate;
  ciphertextAad: Uint8Array;
}

export async function openTenantBoundEnvelope(
  input: OpenTenantBoundEnvelopeInput,
): Promise<Uint8Array> {
  try {
    const layout = parseEnvelopeLayout(input.envelopeBytes, input.recordType);
    const dekBytes = await aesGcmDecrypt(
      input.tenantDataKey,
      layout.dekWrapIv,
      layout.wrappedDek,
      serializeDekWrapAad(
        input.recordType,
        layout.tenantDataKeyVersion,
        input.dekWrapTenantCoordinate,
      ),
    );
    const dekKey = await crypto.subtle.importKey(
      "raw",
      toBufferSource(dekBytes),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
    return await aesGcmDecrypt(dekKey, layout.valueIv, layout.valueCiphertext, input.ciphertextAad);
  } catch (error) {
    if (error instanceof DecryptError) {
      throw error;
    }
    throw new DecryptError();
  }
}
