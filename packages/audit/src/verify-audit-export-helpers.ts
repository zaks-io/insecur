import {
  buildSigningPayload,
  canonicalManifestSigningBytes,
  type UnsignedAuditExportManifest,
} from "./audit-export-manifest.js";
import { verifyEd25519Signature } from "./audit-export-keys.js";
import { scanAuditExportForForbiddenSensitiveValues } from "./audit-export-event.js";
import {
  AUDIT_EXPORT_FAILURE_CODES,
  type AuditExportFailureCode,
  type AuditExportIntegrityChecks,
  type AuditExportJsonlEntry,
  type AuditExportManifest,
  type VerifyAuditExportInput,
} from "./audit-export-types.js";

export function unsignedManifestFromSigned(
  manifest: AuditExportManifest,
): UnsignedAuditExportManifest {
  return {
    schema_version: manifest.schema_version,
    organization_id: manifest.organization_id,
    time_range: manifest.time_range,
    entry_count: manifest.entry_count,
    first_hash: manifest.first_hash,
    last_hash: manifest.last_hash,
    hash_algorithm: manifest.hash_algorithm,
    hmac_key_version: manifest.hmac_key_version,
    signing_key_version: manifest.signing_key_version,
    custody_evidence_refs: manifest.custody_evidence_refs,
  };
}

export function collectSensitiveValueFailures(input: {
  readonly entries: readonly AuditExportJsonlEntry[];
  readonly manifest: AuditExportManifest;
}): AuditExportFailureCode[] {
  const failureCodes: AuditExportFailureCode[] = [];
  const forbiddenKey = scanAuditExportForForbiddenSensitiveValues(input);
  if (forbiddenKey !== null) {
    failureCodes.push(AUDIT_EXPORT_FAILURE_CODES.forbiddenSensitiveValue);
  }
  return failureCodes;
}

export function verifyTenantScope(input: {
  readonly entries: readonly AuditExportJsonlEntry[];
  readonly manifest: AuditExportManifest;
  readonly expectedOrganizationId?: VerifyAuditExportInput["expectedOrganizationId"];
}): {
  readonly status: AuditExportIntegrityChecks["tenant_scope"];
  readonly failureCodes: readonly AuditExportFailureCode[];
} {
  const organizationIds = new Set(input.entries.map((entry) => entry.event.organization_id));
  if (organizationIds.size === 0) {
    return {
      status: "missing",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.tenantScopeMissing],
    };
  }
  if (organizationIds.size > 1) {
    return {
      status: "invalid",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.tenantScopeMismatch],
    };
  }

  const [onlyOrganizationId] = organizationIds;
  if (
    onlyOrganizationId !== input.manifest.organization_id ||
    (input.expectedOrganizationId !== undefined &&
      onlyOrganizationId !== input.expectedOrganizationId)
  ) {
    return {
      status: "invalid",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.tenantScopeMismatch],
    };
  }

  return { status: "valid", failureCodes: [] };
}

export async function verifyManifestHmac(input: {
  readonly manifest: AuditExportManifest;
  readonly keys: VerifyAuditExportInput["keys"];
}): Promise<{
  readonly status: AuditExportIntegrityChecks["manifest_hmac"];
  readonly failureCodes: readonly AuditExportFailureCode[];
}> {
  const hmacProvider = input.keys.getHmacKey(input.manifest.hmac_key_version);
  if (hmacProvider === null) {
    return {
      status: "missing",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.keyEvidenceMissing],
    };
  }

  const manifestHmacValid = await hmacProvider.verify(
    canonicalManifestSigningBytes(unsignedManifestFromSigned(input.manifest)),
    input.manifest.hmac,
  );
  if (!manifestHmacValid) {
    return {
      status: "invalid",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.manifestHmacInvalid],
    };
  }

  return { status: "valid", failureCodes: [] };
}

export async function verifyExportSignature(input: {
  readonly jsonl: string;
  readonly manifest: AuditExportManifest;
  readonly keys: VerifyAuditExportInput["keys"];
}): Promise<{
  readonly status: AuditExportIntegrityChecks["signature"];
  readonly failureCodes: readonly AuditExportFailureCode[];
}> {
  const publicKey = input.keys.getSigningPublicKeyBase64Url(input.manifest.signing_key_version);
  if (publicKey === null) {
    return {
      status: "missing",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.keyEvidenceMissing],
    };
  }

  const signingPayload = await buildSigningPayload({
    jsonl: input.jsonl,
    manifest: input.manifest,
  });
  const signatureValid = await verifyEd25519Signature({
    publicKeyBase64Url: publicKey,
    data: signingPayload,
    signatureBase64Url: input.manifest.signature,
  });
  if (!signatureValid) {
    return {
      status: "invalid",
      failureCodes: [AUDIT_EXPORT_FAILURE_CODES.signatureInvalid],
    };
  }

  return { status: "valid", failureCodes: [] };
}
