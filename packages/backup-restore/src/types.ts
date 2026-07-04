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
  encryption_verified: boolean;
  expires_at: string;
  operation_id?: string;
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
  restore_target_ref?: string;
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
