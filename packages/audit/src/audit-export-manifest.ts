import { canonicalJsonStringify } from "./canonical-json.js";
import { sha256Base64Url } from "./audit-export-hash.js";
import {
  AUDIT_EXPORT_HASH_ALGORITHM,
  AUDIT_EXPORT_SCHEMA_VERSION,
  AUDIT_EXPORT_SIGNATURE_ALGORITHM,
} from "./audit-export-constants.js";
import type {
  AuditExportHmacKeyProvider,
  AuditExportManifest,
  AuditExportSigningKeyProvider,
  AuditExportTimeRange,
} from "./audit-export-types.js";

export type UnsignedAuditExportManifest = Omit<
  AuditExportManifest,
  "hmac" | "signature" | "signature_algorithm"
>;

export function buildUnsignedAuditExportManifest(input: {
  readonly organizationId: string;
  readonly timeRange: AuditExportTimeRange;
  readonly entryCount: number;
  readonly firstHash: string | null;
  readonly lastHash: string | null;
  readonly hmacKey: AuditExportHmacKeyProvider;
  readonly signingKey: AuditExportSigningKeyProvider;
}): UnsignedAuditExportManifest {
  return {
    schema_version: AUDIT_EXPORT_SCHEMA_VERSION,
    organization_id: input.organizationId,
    time_range: input.timeRange,
    entry_count: input.entryCount,
    first_hash: input.firstHash,
    last_hash: input.lastHash,
    hash_algorithm: AUDIT_EXPORT_HASH_ALGORITHM,
    hmac_key_version: input.hmacKey.keyVersion,
    signing_key_version: input.signingKey.keyVersion,
    custody_evidence_refs: {
      hmac: input.hmacKey.custodyEvidenceRef,
      signing: input.signingKey.custodyEvidenceRef,
    },
  };
}

export function canonicalManifestSigningBytes(manifest: UnsignedAuditExportManifest): Uint8Array {
  return new TextEncoder().encode(canonicalJsonStringify(manifest));
}

export async function buildSigningPayload(input: {
  readonly jsonl: string;
  readonly manifest: AuditExportManifest;
}): Promise<Uint8Array> {
  const jsonlSha256 = await sha256Base64Url(input.jsonl);
  const payload = canonicalJsonStringify({
    jsonl_sha256: jsonlSha256,
    manifest: {
      schema_version: input.manifest.schema_version,
      organization_id: input.manifest.organization_id,
      time_range: input.manifest.time_range,
      entry_count: input.manifest.entry_count,
      first_hash: input.manifest.first_hash,
      last_hash: input.manifest.last_hash,
      hash_algorithm: input.manifest.hash_algorithm,
      hmac_key_version: input.manifest.hmac_key_version,
      signing_key_version: input.manifest.signing_key_version,
      hmac: input.manifest.hmac,
      custody_evidence_refs: input.manifest.custody_evidence_refs,
    },
  });
  return new TextEncoder().encode(payload);
}

export async function signAuditExportManifest(input: {
  readonly manifest: UnsignedAuditExportManifest;
  readonly hmacKey: AuditExportHmacKeyProvider;
}): Promise<string> {
  return input.hmacKey.sign(canonicalManifestSigningBytes(input.manifest));
}

export async function finalizeAuditExportManifest(input: {
  readonly manifest: UnsignedAuditExportManifest;
  readonly hmacKey: AuditExportHmacKeyProvider;
  readonly signingKey: AuditExportSigningKeyProvider;
  readonly jsonl: string;
}): Promise<AuditExportManifest> {
  const hmac = await signAuditExportManifest({
    manifest: input.manifest,
    hmacKey: input.hmacKey,
  });
  const manifestWithHmac: AuditExportManifest = {
    ...input.manifest,
    hmac,
    signature: "",
    signature_algorithm: AUDIT_EXPORT_SIGNATURE_ALGORITHM,
  };
  const signingPayload = await buildSigningPayload({
    jsonl: input.jsonl,
    manifest: manifestWithHmac,
  });
  const signature = await input.signingKey.sign(signingPayload);
  return {
    ...manifestWithHmac,
    signature,
  };
}
