import { parseOpaqueResourceId } from "@insecur/domain";
import {
  AUDIT_EXPORT_HASH_ALGORITHM,
  AUDIT_EXPORT_SCHEMA_VERSION,
  AUDIT_EXPORT_SIGNATURE_ALGORITHM,
} from "./audit-export-constants.js";
import type {
  AuditExportManifest,
  AuditExportManifestValidationFailure,
  AuditExportManifestValidationResult,
  AuditExportTimeRange,
} from "./audit-export-types.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as UnknownRecord;
}

function readNonEmptyString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readStringOrNull(record: UnknownRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

function readNonNegativeInteger(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readPositiveInteger(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function readLiteral<T extends string>(record: UnknownRecord, key: string, literal: T): T | null {
  const value = record[key];
  return value === literal ? literal : null;
}

function readTimeRange(value: unknown): AuditExportTimeRange | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const from = readNonEmptyString(record, "from");
  const to = readNonEmptyString(record, "to");
  if (from === null || to === null) {
    return null;
  }
  return { from, to };
}

function readCustodyEvidenceRefs(
  value: unknown,
): { hmac: string | null; signing: string | null } | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const { hmac, signing } = record;
  const hmacValid = hmac === null || typeof hmac === "string";
  const signingValid = signing === null || typeof signing === "string";
  if (!hmacValid || !signingValid) {
    return null;
  }
  return {
    hmac: typeof hmac === "string" ? hmac : null,
    signing: typeof signing === "string" ? signing : null,
  };
}

function buildPartial(record: UnknownRecord | null) {
  if (record === null) {
    return {
      organization_id: null,
      entry_count: 0,
      time_range: null,
      hmac_key_version: null,
      signing_key_version: null,
      custody_evidence_refs: null,
    };
  }

  const organizationId = readNonEmptyString(record, "organization_id");
  return {
    organization_id:
      organizationId !== null && parseOpaqueResourceId(organizationId, "org").ok
        ? organizationId
        : null,
    entry_count: readNonNegativeInteger(record, "entry_count") ?? 0,
    time_range: readTimeRange(record.time_range),
    hmac_key_version: readPositiveInteger(record, "hmac_key_version"),
    signing_key_version: readPositiveInteger(record, "signing_key_version"),
    custody_evidence_refs: readCustodyEvidenceRefs(record.custody_evidence_refs),
  };
}

function validationFailure(
  message: string,
  record: UnknownRecord | null,
): { ok: false; failure: AuditExportManifestValidationFailure } {
  return { ok: false, failure: { message, partial: buildPartial(record) } };
}

interface ManifestValidationFailure {
  readonly ok: false;
  readonly failure: AuditExportManifestValidationFailure;
}

function validateManifestIdentity(record: UnknownRecord): ManifestValidationFailure | null {
  if (readLiteral(record, "schema_version", AUDIT_EXPORT_SCHEMA_VERSION) === null) {
    return validationFailure("unsupported audit export manifest schema version", record);
  }
  const organizationId = readNonEmptyString(record, "organization_id");
  if (organizationId === null || !parseOpaqueResourceId(organizationId, "org").ok) {
    return validationFailure("audit export manifest organization_id is missing or invalid", record);
  }
  if (readTimeRange(record.time_range) === null) {
    return validationFailure("audit export manifest time_range is missing or invalid", record);
  }
  if (readNonNegativeInteger(record, "entry_count") === null) {
    return validationFailure("audit export manifest entry_count is missing or invalid", record);
  }
  return null;
}

function validateManifestIntegrityFields(record: UnknownRecord): ManifestValidationFailure | null {
  if (readStringOrNull(record, "first_hash") === undefined) {
    return validationFailure("audit export manifest first_hash is missing or invalid", record);
  }
  if (readStringOrNull(record, "last_hash") === undefined) {
    return validationFailure("audit export manifest last_hash is missing or invalid", record);
  }
  if (readLiteral(record, "hash_algorithm", AUDIT_EXPORT_HASH_ALGORITHM) === null) {
    return validationFailure("audit export manifest hash_algorithm is missing or invalid", record);
  }
  return null;
}

function validateManifestKeyVersions(record: UnknownRecord): ManifestValidationFailure | null {
  if (readPositiveInteger(record, "hmac_key_version") === null) {
    return validationFailure(
      "audit export manifest hmac_key_version is missing or invalid",
      record,
    );
  }
  if (readPositiveInteger(record, "signing_key_version") === null) {
    return validationFailure(
      "audit export manifest signing_key_version is missing or invalid",
      record,
    );
  }
  return null;
}

function validateManifestSignatureFields(record: UnknownRecord): ManifestValidationFailure | null {
  if (readNonEmptyString(record, "hmac") === null) {
    return validationFailure("audit export manifest hmac is missing or invalid", record);
  }
  if (readString(record, "signature") === null) {
    return validationFailure("audit export manifest signature is missing or invalid", record);
  }
  if (readLiteral(record, "signature_algorithm", AUDIT_EXPORT_SIGNATURE_ALGORITHM) === null) {
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
  if (readCustodyEvidenceRefs(record.custody_evidence_refs) === null) {
    return validationFailure(
      "audit export manifest custody_evidence_refs is missing or invalid",
      record,
    );
  }
  return null;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`audit export manifest validation invariant violated: ${label}`);
  }
  return value;
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
    const failure = validator(record);
    if (failure !== null) {
      return failure;
    }
  }

  return { ok: true, manifest: assembleValidatedManifest(record) };
}

/** Parses and validates an audit export manifest from decoded JSON. */
export function parseAuditExportManifest(raw: unknown): AuditExportManifest {
  const validation = validateAuditExportManifest(raw);
  if (!validation.ok) {
    throw new Error(validation.failure.message);
  }
  return validation.manifest;
}
