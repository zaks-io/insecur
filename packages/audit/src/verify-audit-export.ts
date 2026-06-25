import { assertMetadataOnlyValue } from "@insecur/domain";
import { parseAuditExportJsonl } from "./audit-export-hash-chain.js";
import {
  AUDIT_EXPORT_FAILURE_CODES,
  type AuditExportFailureCode,
  type AuditExportIntegrityChecks,
  type AuditExportManifest,
  type AuditExportVerificationResult,
  type VerifyAuditExportInput,
} from "./audit-export-types.js";
import { AUDIT_EXPORT_SCHEMA_VERSION } from "./audit-export-constants.js";
import {
  collectSensitiveValueFailures,
  verifyExportSignature,
  verifyManifestHmac,
  verifyTenantScope,
} from "./verify-audit-export-helpers.js";
import { verifyHashChain } from "./verify-audit-export-hash-chain.js";

function invalidResult(
  partial: Partial<AuditExportVerificationResult> & {
    readonly integrity: AuditExportIntegrityChecks;
    readonly failure_codes: readonly AuditExportFailureCode[];
  },
): AuditExportVerificationResult {
  return {
    status: "invalid",
    organization_id: partial.organization_id ?? null,
    entry_count: partial.entry_count ?? 0,
    time_range: partial.time_range ?? null,
    integrity: partial.integrity,
    hmac_key_version: partial.hmac_key_version ?? null,
    signing_key_version: partial.signing_key_version ?? null,
    custody_evidence_refs: partial.custody_evidence_refs ?? null,
    failure_codes: partial.failure_codes,
  };
}

function validResult(manifest: AuditExportManifest): AuditExportVerificationResult {
  return {
    status: "valid",
    organization_id: manifest.organization_id,
    entry_count: manifest.entry_count,
    time_range: manifest.time_range,
    integrity: {
      hash_chain: "valid",
      manifest_hmac: "valid",
      signature: "valid",
      tenant_scope: "valid",
    },
    hmac_key_version: manifest.hmac_key_version,
    signing_key_version: manifest.signing_key_version,
    custody_evidence_refs: manifest.custody_evidence_refs,
    failure_codes: [],
  };
}

function finalizeVerificationResult(
  manifest: AuditExportManifest,
  integrity: AuditExportIntegrityChecks,
  failureCodes: readonly AuditExportFailureCode[],
): AuditExportVerificationResult {
  const uniqueFailureCodes = [...new Set(failureCodes)];
  const result =
    uniqueFailureCodes.length === 0 &&
    integrity.hash_chain === "valid" &&
    integrity.manifest_hmac === "valid" &&
    integrity.signature === "valid" &&
    integrity.tenant_scope === "valid"
      ? validResult(manifest)
      : invalidResult({
          organization_id: manifest.organization_id,
          entry_count: manifest.entry_count,
          time_range: manifest.time_range,
          integrity,
          hmac_key_version: manifest.hmac_key_version,
          signing_key_version: manifest.signing_key_version,
          custody_evidence_refs: manifest.custody_evidence_refs,
          failure_codes: uniqueFailureCodes,
        });
  assertMetadataOnlyValue(result);
  return result;
}

function isSupportedManifestSchema(schemaVersion: string): boolean {
  return schemaVersion === AUDIT_EXPORT_SCHEMA_VERSION;
}

function collectCustodyEvidenceFailures(manifest: AuditExportManifest): AuditExportFailureCode[] {
  if (
    manifest.custody_evidence_refs.hmac === null ||
    manifest.custody_evidence_refs.signing === null
  ) {
    return [AUDIT_EXPORT_FAILURE_CODES.keyEvidenceMissing];
  }
  return [];
}

async function verifyParsedExport(input: VerifyAuditExportInput): Promise<{
  readonly integrity: AuditExportIntegrityChecks;
  readonly failureCodes: readonly AuditExportFailureCode[];
}> {
  const entries = parseAuditExportJsonl(input.jsonl);
  const failureCodes: AuditExportFailureCode[] = [];
  if (entries.length !== input.manifest.entry_count) {
    failureCodes.push(AUDIT_EXPORT_FAILURE_CODES.manifestInvalid);
  }
  failureCodes.push(...collectSensitiveValueFailures({ entries, manifest: input.manifest }));

  const tenantScope = verifyTenantScope({
    entries,
    manifest: input.manifest,
    expectedOrganizationId: input.expectedOrganizationId,
  });
  failureCodes.push(...tenantScope.failureCodes);

  const hashChain = await verifyHashChain({ entries, manifest: input.manifest });
  failureCodes.push(...hashChain.failureCodes);

  const manifestHmac = await verifyManifestHmac({ manifest: input.manifest, keys: input.keys });
  failureCodes.push(...manifestHmac.failureCodes);

  const signature = await verifyExportSignature({
    jsonl: input.jsonl,
    manifest: input.manifest,
    keys: input.keys,
  });
  failureCodes.push(...signature.failureCodes);

  return {
    integrity: {
      hash_chain: hashChain.status,
      manifest_hmac: manifestHmac.status,
      signature: signature.status,
      tenant_scope: tenantScope.status,
    },
    failureCodes,
  };
}

/** Verifies a tamper-evident audit export and returns metadata-only evidence. */
export async function verifyAuditExport(
  input: VerifyAuditExportInput,
): Promise<AuditExportVerificationResult> {
  const baseIntegrity: AuditExportIntegrityChecks = {
    hash_chain: "missing",
    manifest_hmac: "missing",
    signature: "missing",
    tenant_scope: "missing",
  };

  if (!isSupportedManifestSchema(input.manifest.schema_version)) {
    return finalizeVerificationResult(
      input.manifest,
      { ...baseIntegrity, manifest_hmac: "invalid" },
      [AUDIT_EXPORT_FAILURE_CODES.manifestInvalid],
    );
  }

  const failureCodes = collectCustodyEvidenceFailures(input.manifest);
  try {
    const verified = await verifyParsedExport(input);
    return finalizeVerificationResult(input.manifest, verified.integrity, [
      ...failureCodes,
      ...verified.failureCodes,
    ]);
  } catch {
    return finalizeVerificationResult(input.manifest, baseIntegrity, [
      ...failureCodes,
      AUDIT_EXPORT_FAILURE_CODES.manifestInvalid,
    ]);
  }
}

export function parseAuditExportManifest(raw: unknown): AuditExportManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("audit export manifest must be a JSON object");
  }
  const manifest = raw as Record<string, unknown>;
  if (!isSupportedManifestSchema(String(manifest.schema_version))) {
    throw new Error("unsupported audit export manifest schema version");
  }
  return manifest as unknown as AuditExportManifest;
}
