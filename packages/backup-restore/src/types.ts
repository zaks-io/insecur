import type { EnvironmentId, OrganizationId, ProjectId, SecretId } from "@insecur/domain";

export type BackupRestoreEvidenceStatus = "passed" | "failed" | "missing_evidence" | "blocked";

export interface TenantProjectScope {
  instance_id: string;
  organization_id: OrganizationId | string;
  project_id: ProjectId | string;
  secret_id?: SecretId | string;
  environment_id?: EnvironmentId | string;
}

export interface BackupExportOrganizationSnapshot {
  organization_id: string;
  snapshot_at: string;
}

export interface BackupExportHeader {
  format_marker: string;
  instance_id: string;
  export_timestamp: string;
  instance_snapshot_at: string;
  root_key_version: number;
  dek_iv: string;
  wrapped_dek: string;
  payload_iv: string;
  organization_snapshots: BackupExportOrganizationSnapshot[];
}

export interface BackupExportSuccessEvidence {
  status: "passed" | "failed";
  checked_at: string;
  instance_id: string;
  export_timestamp: string;
  root_key_version: number;
  organization_count: number;
  artifact_ref: string;
  artifact_sha256: string;
  encryption_verified: boolean;
  expires_at: string;
  operation_id?: string;
}

/** Metadata-only result of a completed restore import (ADR-0084). Never row payloads. */
export interface RestoreImportSuccess {
  status: "succeeded";
  instance_id: string;
  artifact_ref: string;
  source_export_operation_id: string;
  source_export_timestamp: string;
  /** Organizations actually imported (manifest minus vanished-org no-ops). */
  organization_count: number;
  /** Organizations named in the export header manifest. */
  manifest_organization_count: number;
  /** Manifest organizations skipped as no-ops for an empty payload bucket (ADR-0072). */
  skipped_organization_count: number;
  /** Opaque IDs of the skipped organizations, sorted; empty when none were dropped. */
  skipped_organization_ids: readonly string[];
  /**
   * Bootstrap operator claims dropped because their referenced organization was not in the imported
   * set (torn export, ADR-0072). Always 0 for a production restore of a single consistent instance.
   */
  dropped_bootstrap_claim_count: number;
  imported_row_count: number;
  operation_id: string;
  completed_at: string;
}

export interface RestoreDrillRtoMetadata {
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  target_seconds: number;
}

export interface RestoreDrillCanaryVerification {
  status: "passed" | "failed";
  checked_at: string;
  variable_key: string;
}

export interface RestoreDrillEvidence {
  status: "passed" | "failed";
  checked_at: string;
  actor: string;
  scope: TenantProjectScope;
  rto: RestoreDrillRtoMetadata;
  canary_verification: RestoreDrillCanaryVerification;
  encryption_verified: boolean;
  artifact_ref: string;
  source_artifact_kind: "scheduled_r2_export";
  source_export_operation_id: string;
  source_export_timestamp: string;
  restore_target_ref: string;
  restore_target_kind: "fresh_neon_project";
  import_completed_at: string;
  runtime_canary_verified_at: string;
}

export interface BackupFixtureSelfTestEvidence {
  status: "passed" | "failed";
  checked_at: string;
  fixture_only: true;
  encryption_verified: boolean;
  canary_verified: boolean;
  artifact_ref: string;
}

export interface BackupEncryptionConfigCheck {
  status: "passed" | "failed";
  checked_at: string;
  instance_id: string;
  root_key_version: number | null;
  format_marker: string | null;
  missing_fields: string[];
}

export interface RecoveryCanaryVerificationResult {
  status: "passed" | "failed";
  checked_at: string;
  scope: TenantProjectScope;
  variable_key: string;
}
