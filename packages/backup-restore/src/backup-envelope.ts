import { bytesToBase64Url, base64UrlToBytes } from "@insecur/domain";
import {
  DEFAULT_ROOT_KEY_VERSION,
  aesGcmDecrypt,
  aesGcmEncrypt,
  concatBytes,
  randomIv,
} from "@insecur/crypto";

import { BACKUP_EXPORT_FORMAT_MARKER } from "./constants.js";
import { collectMissingBackupHeaderFields } from "./backup-encryption-config.js";
import type { BackupExportHeader, BackupExportOrganizationSnapshot } from "./types.js";

const BACKUP_MAGIC = new Uint8Array([0x49, 0x42, 0x4b, 0x50]);

interface ProtectedBackupHeaderMetadata {
  format_marker: string;
  instance_id: string;
  export_timestamp: string;
  root_key_version: number;
  organization_snapshots: BackupExportOrganizationSnapshot[];
}

function canonicalOrganizationSnapshots(
  snapshots: BackupExportOrganizationSnapshot[],
): BackupExportOrganizationSnapshot[] {
  return [...snapshots].sort((left, right) =>
    left.organization_id.localeCompare(right.organization_id),
  );
}

/** AAD binds restore-evidence header fields so tampered metadata fails decryption. */
function serializeProtectedHeaderAad(metadata: ProtectedBackupHeaderMetadata): Uint8Array {
  const canonical = JSON.stringify({
    format_marker: metadata.format_marker,
    instance_id: metadata.instance_id,
    export_timestamp: metadata.export_timestamp,
    root_key_version: metadata.root_key_version,
    organization_snapshots: canonicalOrganizationSnapshots(metadata.organization_snapshots),
  });
  return new TextEncoder().encode(canonical);
}

function protectedMetadataFromHeader(header: BackupExportHeader): ProtectedBackupHeaderMetadata {
  return {
    format_marker: header.format_marker,
    instance_id: header.instance_id,
    export_timestamp: header.export_timestamp,
    root_key_version: header.root_key_version,
    organization_snapshots: header.organization_snapshots,
  };
}

function protectedMetadataFromSealInput(
  input: SealBackupArtifactInput,
): ProtectedBackupHeaderMetadata {
  return {
    format_marker: BACKUP_EXPORT_FORMAT_MARKER,
    instance_id: input.instanceId,
    export_timestamp: input.exportTimestamp,
    root_key_version: input.rootKeyVersion ?? DEFAULT_ROOT_KEY_VERSION,
    organization_snapshots: input.organizationSnapshots,
  };
}

async function importAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export interface SealBackupArtifactInput {
  instanceId: string;
  exportTimestamp: string;
  rootKeyBytes: Uint8Array;
  rootKeyVersion?: number;
  jsonlPayload: Uint8Array;
  organizationSnapshots: BackupExportHeader["organization_snapshots"];
}

export interface OpenBackupArtifactInput {
  instanceId: string;
  rootKeyBytes: Uint8Array;
  sealedBytes: Uint8Array;
}

export interface OpenedBackupArtifact {
  header: BackupExportHeader;
  jsonlPayload: Uint8Array;
}

function parseHeaderJson(bytes: Uint8Array): BackupExportHeader {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("backup header is not an object");
  }
  return parsed as BackupExportHeader;
}

function readSealedBackupLayout(bytes: Uint8Array): {
  headerBytes: Uint8Array;
  payloadBytes: Uint8Array;
} {
  if (bytes.byteLength < 8) {
    throw new Error("backup artifact is too short");
  }

  const magic = bytes.subarray(0, 4);
  for (let index = 0; index < BACKUP_MAGIC.byteLength; index += 1) {
    if (magic[index] !== BACKUP_MAGIC[index]) {
      throw new Error("backup artifact magic mismatch");
    }
  }

  const headerLength = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, false);
  const headerStart = 8;
  const headerEnd = headerStart + headerLength;
  if (bytes.byteLength < headerEnd) {
    throw new Error("backup artifact header length is invalid");
  }

  return {
    headerBytes: bytes.subarray(headerStart, headerEnd),
    payloadBytes: bytes.subarray(headerEnd),
  };
}

async function decryptBackupPayload(
  header: BackupExportHeader,
  payloadBytes: Uint8Array,
  rootKeyBytes: Uint8Array,
): Promise<Uint8Array> {
  const dekIv = base64UrlToBytes(header.dek_iv);
  const wrappedDek = base64UrlToBytes(header.wrapped_dek);
  const payloadIv = base64UrlToBytes(header.payload_iv);
  if (!dekIv || !wrappedDek || !payloadIv) {
    throw new Error("backup artifact header encoding is invalid");
  }

  const rootKey = await importAesKey(rootKeyBytes);
  const aad = serializeProtectedHeaderAad(protectedMetadataFromHeader(header));
  const exportDek = await aesGcmDecrypt(rootKey, dekIv, wrappedDek, aad);
  const exportDekKey = await importAesKey(exportDek);
  return aesGcmDecrypt(exportDekKey, payloadIv, payloadBytes, aad);
}

export async function sealBackupArtifact(input: SealBackupArtifactInput): Promise<Uint8Array> {
  const protectedMetadata = protectedMetadataFromSealInput(input);
  const exportDek = new Uint8Array(32);
  crypto.getRandomValues(exportDek);
  const rootKey = await importAesKey(input.rootKeyBytes);
  const aad = serializeProtectedHeaderAad(protectedMetadata);
  const dekIv = randomIv();
  const payloadIv = randomIv();
  const wrappedDek = await aesGcmEncrypt(rootKey, dekIv, exportDek, aad);
  const exportDekKey = await importAesKey(exportDek);
  const payloadCiphertext = await aesGcmEncrypt(exportDekKey, payloadIv, input.jsonlPayload, aad);

  const header: BackupExportHeader = {
    format_marker: protectedMetadata.format_marker,
    instance_id: protectedMetadata.instance_id,
    export_timestamp: protectedMetadata.export_timestamp,
    root_key_version: protectedMetadata.root_key_version,
    dek_iv: bytesToBase64Url(dekIv),
    wrapped_dek: bytesToBase64Url(wrappedDek),
    payload_iv: bytesToBase64Url(payloadIv),
    organization_snapshots: input.organizationSnapshots,
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const headerLength = new Uint8Array(4);
  new DataView(headerLength.buffer).setUint32(0, headerBytes.byteLength, false);

  return concatBytes(BACKUP_MAGIC, headerLength, headerBytes, payloadCiphertext);
}

export async function openBackupArtifact(
  input: OpenBackupArtifactInput,
): Promise<OpenedBackupArtifact> {
  const { headerBytes, payloadBytes } = readSealedBackupLayout(input.sealedBytes);
  const header = parseHeaderJson(headerBytes);
  const missingFields = collectMissingBackupHeaderFields(header);
  if (missingFields.length > 0) {
    throw new Error(`backup encryption configuration invalid: ${missingFields.join(", ")}`);
  }

  const jsonlPayload = await decryptBackupPayload(header, payloadBytes, input.rootKeyBytes);
  if (header.instance_id !== input.instanceId) {
    throw new Error("backup artifact instance_id mismatch");
  }

  return { header, jsonlPayload };
}
