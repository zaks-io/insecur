import { parseOpaqueResourceId } from "@insecur/domain";
import type { AuditExportTimeRange } from "./audit-export-types.js";

export type UnknownRecord = Record<string, unknown>;

interface AuditExportManifestPartial {
  readonly organization_id: string | null;
  readonly entry_count: number;
  readonly time_range: AuditExportTimeRange | null;
  readonly hmac_key_version: number | null;
  readonly signing_key_version: number | null;
  readonly custody_evidence_refs: {
    readonly hmac: string | null;
    readonly signing: string | null;
  } | null;
}

export interface AuditExportManifestValidationFailure {
  readonly message: string;
  readonly partial: AuditExportManifestPartial;
}

export function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as UnknownRecord;
}

export function readNonEmptyString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function readStringOrNull(record: UnknownRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

export function readNonNegativeInteger(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function readPositiveInteger(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

export function readLiteral<T extends string>(
  record: UnknownRecord,
  key: string,
  literal: T,
): T | null {
  const value = record[key];
  return value === literal ? literal : null;
}

export function readTimeRange(value: unknown): AuditExportTimeRange | null {
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

export function readCustodyEvidenceRefs(
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

export function buildPartial(record: UnknownRecord | null): AuditExportManifestPartial {
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
  const entryCount = readNonNegativeInteger(record, "entry_count");
  const timeRange = readTimeRange(record.time_range);
  const hmacKeyVersion = readPositiveInteger(record, "hmac_key_version");
  const signingKeyVersion = readPositiveInteger(record, "signing_key_version");
  const custodyEvidenceRefs = readCustodyEvidenceRefs(record.custody_evidence_refs);

  return {
    organization_id:
      organizationId !== null && parseOpaqueResourceId(organizationId, "org").ok
        ? organizationId
        : null,
    entry_count: entryCount ?? 0,
    time_range: timeRange,
    hmac_key_version: hmacKeyVersion,
    signing_key_version: signingKeyVersion,
    custody_evidence_refs: custodyEvidenceRefs,
  };
}

export function validationFailure(
  message: string,
  record: UnknownRecord | null,
): { ok: false; failure: AuditExportManifestValidationFailure } {
  return {
    ok: false,
    failure: {
      message,
      partial: buildPartial(record),
    },
  };
}
