import type { OrganizationId } from "@insecur/domain";
import type {
  AUDIT_EXPORT_HASH_ALGORITHM,
  AUDIT_EXPORT_SCHEMA_VERSION,
  AUDIT_EXPORT_SIGNATURE_ALGORITHM,
} from "./audit-export-constants.js";

export const AUDIT_EXPORT_FAILURE_CODES = {
  chainBroken: "audit.export.chain_broken",
  entryTampered: "audit.export.entry_tampered",
  manifestInvalid: "audit.export.manifest_invalid",
  manifestHmacInvalid: "audit.export.manifest_hmac_invalid",
  signatureInvalid: "audit.export.signature_invalid",
  tenantScopeMissing: "audit.export.tenant_scope_missing",
  tenantScopeMismatch: "audit.export.tenant_scope_mismatch",
  keyEvidenceMissing: "audit.export.key_evidence_missing",
  forbiddenSensitiveValue: "audit.export.forbidden_sensitive_value",
} as const;

export type AuditExportFailureCode =
  (typeof AUDIT_EXPORT_FAILURE_CODES)[keyof typeof AUDIT_EXPORT_FAILURE_CODES];

export type AuditExportIntegrityStatus = "valid" | "invalid" | "missing";

export interface AuditExportEventPayload {
  readonly id: string;
  readonly organization_id: string;
  readonly event_code: string;
  readonly outcome: "success" | "denied";
  readonly result_code: string;
  readonly actor_type: string;
  readonly actor_user_id: string | null;
  readonly project_id: string | null;
  readonly environment_id: string | null;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly related_resource_type: string | null;
  readonly related_resource_id: string | null;
  readonly request_id: string | null;
  readonly operation_id: string | null;
  readonly details: Record<string, string | number | boolean | null> | null;
  readonly recorded_at: string;
}

export interface AuditExportChainLink {
  readonly previous_hash: string | null;
  readonly entry_hash: string;
}

export interface AuditExportJsonlEntry {
  readonly schema_version: typeof AUDIT_EXPORT_SCHEMA_VERSION;
  readonly sequence: number;
  readonly event: AuditExportEventPayload;
  readonly chain: AuditExportChainLink;
}

export interface AuditExportTimeRange {
  readonly from: string;
  readonly to: string;
}

export interface AuditExportManifest {
  readonly schema_version: typeof AUDIT_EXPORT_SCHEMA_VERSION;
  readonly organization_id: string;
  readonly time_range: AuditExportTimeRange;
  readonly entry_count: number;
  readonly first_hash: string | null;
  readonly last_hash: string | null;
  readonly hash_algorithm: typeof AUDIT_EXPORT_HASH_ALGORITHM;
  readonly hmac_key_version: number;
  readonly signing_key_version: number;
  readonly hmac: string;
  readonly signature: string;
  readonly signature_algorithm: typeof AUDIT_EXPORT_SIGNATURE_ALGORITHM;
  readonly custody_evidence_refs: {
    readonly hmac: string | null;
    readonly signing: string | null;
  };
}

export interface AuditExportBundle {
  readonly jsonl: string;
  readonly manifest: AuditExportManifest;
}

export interface AuditExportKeyCustodyMetadata {
  readonly keyVersion: number;
  readonly custodyEvidenceRef: string | null;
}

export interface AuditExportHmacKeyProvider extends AuditExportKeyCustodyMetadata {
  sign(data: Uint8Array): Promise<string>;
  verify(data: Uint8Array, signature: string): Promise<boolean>;
}

export interface AuditExportSigningKeyProvider extends AuditExportKeyCustodyMetadata {
  readonly publicKeyBase64Url: string;
  sign(data: Uint8Array): Promise<string>;
}

export interface AuditExportVerificationKeys {
  getHmacKey(version: number): AuditExportHmacKeyProvider | null;
  getSigningPublicKeyBase64Url(version: number): string | null;
  getSigningCustodyEvidenceRef(version: number): string | null;
}

export interface AuditExportIntegrityChecks {
  readonly hash_chain: AuditExportIntegrityStatus;
  readonly manifest_hmac: AuditExportIntegrityStatus;
  readonly signature: AuditExportIntegrityStatus;
  readonly tenant_scope: AuditExportIntegrityStatus;
}

export interface AuditExportVerificationResult {
  readonly status: "valid" | "invalid";
  readonly organization_id: string | null;
  readonly entry_count: number;
  readonly time_range: AuditExportTimeRange | null;
  readonly integrity: AuditExportIntegrityChecks;
  readonly hmac_key_version: number | null;
  readonly signing_key_version: number | null;
  readonly custody_evidence_refs: {
    readonly hmac: string | null;
    readonly signing: string | null;
  } | null;
  readonly failure_codes: readonly AuditExportFailureCode[];
}

export interface BuildAuditExportInput {
  readonly organizationId: OrganizationId;
  readonly events: readonly AuditExportEventPayload[];
  readonly timeRange: AuditExportTimeRange;
  readonly hmacKey: AuditExportHmacKeyProvider;
  readonly signingKey: AuditExportSigningKeyProvider;
}

export interface VerifyAuditExportInput {
  readonly jsonl: string;
  readonly manifest: AuditExportManifest;
  readonly expectedOrganizationId?: OrganizationId;
  readonly keys: AuditExportVerificationKeys;
}
