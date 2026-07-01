import {
  ENVELOPE_FORMAT_VERSION,
  ENVELOPE_MAGIC,
  GCM_IV_LENGTH,
  RECORD_TYPE_SECRET,
} from "./constants.js";
import { DecryptError } from "./errors.js";

const ENVELOPE_HEADER_LENGTH =
  ENVELOPE_MAGIC.byteLength + 1 + 1 + 4 + GCM_IV_LENGTH + 2 + GCM_IV_LENGTH + 4;

export interface ParsedEnvelopeLayout {
  tenantDataKeyVersion: number;
  dekWrapIv: Uint8Array;
  valueIv: Uint8Array;
  wrappedDek: Uint8Array;
  valueCiphertext: Uint8Array;
}

function readU32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readU16BE(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

export interface EnvelopeHeaderWriteInput {
  recordType: number;
  tenantDataKeyVersion: number;
  dekWrapIv: Uint8Array;
  wrappedDekLength: number;
  valueIv: Uint8Array;
  valueCiphertextLength: number;
}

export function writeEnvelopeHeader(input: EnvelopeHeaderWriteInput): Uint8Array {
  const header = new Uint8Array(ENVELOPE_HEADER_LENGTH);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  header.set(ENVELOPE_MAGIC, 0);
  view.setUint8(ENVELOPE_MAGIC.byteLength, ENVELOPE_FORMAT_VERSION);
  view.setUint8(ENVELOPE_MAGIC.byteLength + 1, input.recordType);
  view.setUint32(ENVELOPE_MAGIC.byteLength + 2, input.tenantDataKeyVersion, false);
  header.set(input.dekWrapIv, ENVELOPE_MAGIC.byteLength + 6);
  view.setUint16(ENVELOPE_MAGIC.byteLength + 6 + GCM_IV_LENGTH, input.wrappedDekLength, false);
  header.set(input.valueIv, ENVELOPE_MAGIC.byteLength + 8 + GCM_IV_LENGTH);
  view.setUint32(
    ENVELOPE_MAGIC.byteLength + 8 + GCM_IV_LENGTH + GCM_IV_LENGTH,
    input.valueCiphertextLength,
    false,
  );
  return header;
}

function assertEnvelopeMagic(bytes: Uint8Array): void {
  if (bytes.byteLength < ENVELOPE_HEADER_LENGTH) {
    throw new DecryptError();
  }
  for (let index = 0; index < ENVELOPE_MAGIC.byteLength; index += 1) {
    if (bytes[index] !== ENVELOPE_MAGIC[index]) {
      throw new DecryptError();
    }
  }
}

function readEnvelopeHeader(
  view: DataView,
  bytes: Uint8Array,
  expectedRecordType: number,
): Omit<ParsedEnvelopeLayout, "wrappedDek" | "valueCiphertext"> & {
  wrappedDekLength: number;
  valueCiphertextLength: number;
} {
  const formatVersion = view.getUint8(ENVELOPE_MAGIC.byteLength);
  const recordType = view.getUint8(ENVELOPE_MAGIC.byteLength + 1);
  if (formatVersion !== ENVELOPE_FORMAT_VERSION || recordType !== expectedRecordType) {
    throw new DecryptError();
  }

  const tenantDataKeyVersion = readU32BE(view, ENVELOPE_MAGIC.byteLength + 2);
  const dekWrapIvStart = ENVELOPE_MAGIC.byteLength + 6;
  const dekWrapIv = bytes.subarray(dekWrapIvStart, dekWrapIvStart + GCM_IV_LENGTH);
  const wrappedDekLength = readU16BE(view, dekWrapIvStart + GCM_IV_LENGTH);
  const valueIvStart = dekWrapIvStart + GCM_IV_LENGTH + 2;
  const valueIv = bytes.subarray(valueIvStart, valueIvStart + GCM_IV_LENGTH);
  const valueCiphertextLength = readU32BE(view, valueIvStart + GCM_IV_LENGTH);
  return { tenantDataKeyVersion, dekWrapIv, valueIv, wrappedDekLength, valueCiphertextLength };
}

export function parseEnvelopeLayout(
  bytes: Uint8Array,
  expectedRecordType: number = RECORD_TYPE_SECRET,
): ParsedEnvelopeLayout {
  assertEnvelopeMagic(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = readEnvelopeHeader(view, bytes, expectedRecordType);
  const wrappedDekStart = ENVELOPE_HEADER_LENGTH;
  const valueCiphertextStart = wrappedDekStart + header.wrappedDekLength;
  const expectedLength = valueCiphertextStart + header.valueCiphertextLength;
  if (bytes.byteLength !== expectedLength) {
    throw new DecryptError();
  }

  return {
    tenantDataKeyVersion: header.tenantDataKeyVersion,
    dekWrapIv: header.dekWrapIv,
    valueIv: header.valueIv,
    wrappedDek: bytes.subarray(wrappedDekStart, valueCiphertextStart),
    valueCiphertext: bytes.subarray(valueCiphertextStart, expectedLength),
  };
}
