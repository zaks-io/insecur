import { parseOpaqueResourceId } from "@insecur/domain";
import {
  AUDIT_EXPORT_HASH_ALGORITHM,
  AUDIT_EXPORT_SCHEMA_VERSION,
  AUDIT_EXPORT_SIGNATURE_ALGORITHM,
} from "./audit-export-constants.js";
import type { AuditExportManifest } from "./audit-export-types.js";
import {
  asRecord,
  readCustodyEvidenceRefs,
  readLiteral,
  readNonEmptyString,
  readNonNegativeInteger,
  readPositiveInteger,
  readString,
  readStringOrNull,
  readTimeRange,
  type AuditExportManifestValidationFailure,
  validationFailure,
  type UnknownRecord,
} from "./parse-audit-export-manifest-helpers.js";

export type AuditExportManifestValidationResult =
  | { readonly ok: true; readonly manifest: AuditExportManifest }
  | { readonly ok: false; readonly failure: AuditExportManifestValidationFailure };

interface ManifestValidationFailure {
  readonly ok: false;
  readonly failure: AuditExportManifestValidationFailure;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`audit export manifest validation invariant violated: ${label}`);
  }
  return value;
}

function validateManifestIdentity(record: UnknownRecord): ManifestValidationFailure | null {
  const schemaVersion = readLiteral(record, "schema_version", AUDIT_EXPORT_SCHEMA_VERSION);
  if (schemaVersion === null) {
    return validationFailure("unsupported audit export manifest schema version", record);
  }

  const organizationId = readNonEmptyString(record, "organization_id");
  if (organizationId === null || !parseOpaqueResourceId(organizationId, "org").ok) {
    return validationFailure("audit export manifest organization_id is missing or invalid", record);
  }

  const timeRange = readTimeRange(record.time_range);
  if (timeRange === null) {
    return validationFailure("audit export manifest time_range is missing or invalid", record);
  }

  const entryCount = readNonNegativeInteger(record, "entry_count");
  if (entryCount === null) {
    return validationFailure("audit export manifest entry_count is missing or invalid", record);
  }

  return null;
}

function validateManifestIntegrityFields(record: UnknownRecord): ManifestValidationFailure | null {
  const firstHash = readStringOrNull(record, "first_hash");
  if (firstHash === undefined) {
    return validationFailure("audit export manifest first_hash is missing or invalid", record);
  }

  const lastHash = readStringOrNull(record, "last_hash");
  if (lastHash === undefined) {
    return validationFailure("audit export manifest last_hash is missing or invalid", record);
  }

  const hashAlgorithm = readLiteral(record, "hash_algorithm", AUDIT_EXPORT_HASH_ALGORITHM);
  if (hashAlgorithm === null) {
    return validationFailure("audit export manifest hash_algorithm is missing or invalid", record);
  }

  return null;
}

function validateManifestKeyVersions(record: UnknownRecord): ManifestValidationFailure | null {
  const hmacKeyVersion = readPositiveInteger(record, "hmac_key_version");
  if (hmacKeyVersion === null) {
    return validationFailure(
      "audit export manifest hmac_key_version is missing or invalid",
      record,
    );
  }

  const signingKeyVersion = readPositiveInteger(record, "signing_key_version");
  if (signingKeyVersion === null) {
    return validationFailure(
      "audit export manifest signing_key_version is missing or invalid",
      record,
    );
  }

  return null;
}

function validateManifestSignatureFields(record: UnknownRecord): ManifestValidationFailure | null {
  const hmac = readNonEmptyString(record, "hmac");
  if (hmac === null) {
    return validationFailure("audit export manifest hmac is missing or invalid", record);
  }

  const signature = readString(record, "signature");
  if (signature === null) {
    return validationFailure("audit export manifest signature is missing or invalid", record);
  }

  const signatureAlgorithm = readLiteral(
    record,
    "signature_algorithm",
    AUDIT_EXPORT_SIGNATURE_ALGORITHM,
  );
  if (signatureAlgorithm === null) {
    return validationFailure(
      "audit export manifest signature_algorithm is missing or invalid",
      record,
    );
  }

  return null;
}

function validateManifestCustodyEvidenceRefs(
  record: UnknownRecord,
): ManifestValidationFailure | null {
  const custodyEvidenceRefs = readCustodyEvidenceRefs(record.custody_evidence_refs);
  if (custodyEvidenceRefs === null) {
    return validationFailure(
      "audit export manifest custody_evidence_refs is missing or invalid",
      record,
    );
  }

  return null;
}

function requiredStringOrNull(value: string | null | undefined, label: string): string | null {
  if (value === undefined) {
    throw new Error(`audit export manifest validation invariant violated: ${label}`);
  }
  return value;
}

function assembleValidatedManifest(record: UnknownRecord): AuditExportManifest {
  return {
    schema_version: required(
      readLiteral(record, "schema_version", AUDIT_EXPORT_SCHEMA_VERSION),
      "schema_version",
    ),
    organization_id: required(readNonEmptyString(record, "organization_id"), "organization_id"),
    time_range: required(readTimeRange(record.time_range), "time_range"),
    entry_count: required(readNonNegativeInteger(record, "entry_count"), "entry_count"),
    first_hash: requiredStringOrNull(readStringOrNull(record, "first_hash"), "first_hash"),
    last_hash: requiredStringOrNull(readStringOrNull(record, "last_hash"), "last_hash"),
    hash_algorithm: required(
      readLiteral(record, "hash_algorithm", AUDIT_EXPORT_HASH_ALGORITHM),
      "hash_algorithm",
    ),
    hmac_key_version: required(readPositiveInteger(record, "hmac_key_version"), "hmac_key_version"),
    signing_key_version: required(
      readPositiveInteger(record, "signing_key_version"),
      "signing_key_version",
    ),
    hmac: required(readNonEmptyString(record, "hmac"), "hmac"),
    signature: required(readString(record, "signature"), "signature"),
    signature_algorithm: required(
      readLiteral(record, "signature_algorithm", AUDIT_EXPORT_SIGNATURE_ALGORITHM),
      "signature_algorithm",
    ),
    custody_evidence_refs: required(
      readCustodyEvidenceRefs(record.custody_evidence_refs),
      "custody_evidence_refs",
    ),
  };
}

/** Validates audit export manifest structure before verification or CLI key loading. */
export function validateAuditExportManifest(raw: unknown): AuditExportManifestValidationResult {
  const record = asRecord(raw);
  if (record === null) {
    return validationFailure("audit export manifest must be a JSON object", null);
  }

  for (const validator of [
    validateManifestIdentity,
    validateManifestIntegrityFields,
    validateManifestKeyVersions,
    validateManifestSignatureFields,
    validateManifestCustodyEvidenceRefs,
  ]) {
    const validationFailureResult = validator(record);
    if (validationFailureResult !== null) {
      return validationFailureResult;
    }
  }

  return {
    ok: true,
    manifest: assembleValidatedManifest(record),
  };
}

/** Parses and validates an audit export manifest from decoded JSON. */
export function parseAuditExportManifest(raw: unknown): AuditExportManifest {
  const validation = validateAuditExportManifest(raw);
  if (!validation.ok) {
    throw new Error(validation.failure.message);
  }
  return validation.manifest;
}
