import { AUDIT_EXPORT_SIGNATURE_ALGORITHM } from "./audit-export-constants.js";
import type { StaticAuditExportVerificationKeys } from "./audit-export-keys.js";

export const AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION = "1" as const;
export const AUDIT_EXPORT_CLAIM_CEILING = "tamper-evident, independently verifiable" as const;

export interface AuditExportPublishedSigningKey {
  readonly version: number;
  readonly public_key_base64url: string;
  readonly custody_evidence_ref: string | null;
  readonly retired_at?: string;
  readonly active_since?: string;
}

export interface AuditExportPublishedSigningKeys {
  readonly schema_version: typeof AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION;
  readonly algorithm: typeof AUDIT_EXPORT_SIGNATURE_ALGORITHM;
  readonly current_version: number;
  readonly keys: readonly AuditExportPublishedSigningKey[];
  readonly claim_ceiling: typeof AUDIT_EXPORT_CLAIM_CEILING;
}

function readPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} is missing or invalid`);
  }
  return value;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is missing or invalid`);
  }
  return value;
}

function readOptionalIsoTimestamp(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const raw = readNonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(raw))) {
    throw new Error(`${label} is missing or invalid`);
  }
  return new Date(raw).toISOString();
}

function parsePublishedSigningKey(raw: unknown): AuditExportPublishedSigningKey {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("audit export published signing key must be a JSON object");
  }
  const record = raw as Record<string, unknown>;
  const parsed: AuditExportPublishedSigningKey = {
    version: readPositiveInteger(record.version, "audit export published signing key version"),
    public_key_base64url: readNonEmptyString(
      record.public_key_base64url,
      "audit export published signing key public_key_base64url",
    ),
    custody_evidence_ref:
      record.custody_evidence_ref === null
        ? null
        : readNonEmptyString(
            record.custody_evidence_ref,
            "audit export published signing key custody_evidence_ref",
          ),
  };
  const retiredAt = readOptionalIsoTimestamp(
    record.retired_at,
    "audit export published signing key retired_at",
  );
  const activeSince = readOptionalIsoTimestamp(
    record.active_since,
    "audit export published signing key active_since",
  );
  return {
    ...parsed,
    ...(retiredAt === undefined ? {} : { retired_at: retiredAt }),
    ...(activeSince === undefined ? {} : { active_since: activeSince }),
  };
}

function readPublishedSigningKeysRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("audit export published signing keys must be a JSON object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schema_version !== AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION) {
    throw new Error("unsupported audit export published signing keys schema version");
  }
  if (record.algorithm !== AUDIT_EXPORT_SIGNATURE_ALGORITHM) {
    throw new Error("unsupported audit export published signing keys algorithm");
  }
  if (record.claim_ceiling !== AUDIT_EXPORT_CLAIM_CEILING) {
    throw new Error("audit export published signing keys claim_ceiling is missing or invalid");
  }
  return record;
}

function parsePublishedSigningKeyList(raw: unknown): AuditExportPublishedSigningKey[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("audit export published signing keys keys is missing or invalid");
  }
  const keys = raw.map(parsePublishedSigningKey);
  const versions = new Set(keys.map((key) => key.version));
  if (versions.size !== keys.length) {
    throw new Error("audit export published signing keys contain duplicate versions");
  }
  return keys;
}

/** Parses the published audit-export signing public-key document (ADR-0045). */
export function parseAuditExportPublishedSigningKeys(
  raw: unknown,
): AuditExportPublishedSigningKeys {
  const record = readPublishedSigningKeysRecord(raw);
  const keys = parsePublishedSigningKeyList(record.keys);
  const currentVersion = readPositiveInteger(
    record.current_version,
    "audit export published signing keys current_version",
  );
  if (!keys.some((key) => key.version === currentVersion)) {
    throw new Error("audit export published signing keys current_version is not listed in keys");
  }

  return {
    schema_version: AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS_SCHEMA_VERSION,
    algorithm: AUDIT_EXPORT_SIGNATURE_ALGORITHM,
    current_version: currentVersion,
    keys,
    claim_ceiling: AUDIT_EXPORT_CLAIM_CEILING,
  };
}

export function registerPublishedSigningKeys(
  verificationKeys: StaticAuditExportVerificationKeys,
  published: AuditExportPublishedSigningKeys,
): void {
  for (const key of published.keys) {
    verificationKeys.registerSigningPublicKey({
      keyVersion: key.version,
      publicKeyBase64Url: key.public_key_base64url,
      custodyEvidenceRef: key.custody_evidence_ref,
    });
  }
}
