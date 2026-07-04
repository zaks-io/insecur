export const EVIDENCE_BUNDLE_SCHEMA_VERSION = "1" as const;

export type ReleaseGateProfile =
  | "small_group_production"
  | "broad_public_signup"
  | "production_deploy"
  | "migration"
  | "sensitive_surface_change";

export type ControlStatus = "passed" | "blocked" | "missing_evidence";

export type ReleaseGateVerdictStatus = "passed" | "blocked";

export interface EvidenceArtifactRef {
  kind: "file" | "ci_job" | "audit_export" | "runbook_drill" | "adr" | "linear_issue" | "pr";
  path?: string;
  id?: string;
  uri?: string;
}

export interface ReleaseGateControl {
  id: string;
  status: ControlStatus;
  blocking: boolean;
  summary: string;
  evidence: EvidenceArtifactRef[];
  docs?: string[];
  checked_at?: string;
  expires_at?: string;
  blocking_reason?: string;
}

export interface SecurityEvidenceBundle {
  schema_version: typeof EVIDENCE_BUNDLE_SCHEMA_VERSION;
  generated_at: string;
  profile: ReleaseGateProfile;
  status: ReleaseGateVerdictStatus;
  ok: boolean;
  controls: ReleaseGateControl[];
}

export interface VerifyEvidence {
  status: "passed" | "failed";
  command: string;
  checked_at: string;
  log_ref?: string;
}

export interface SecretScanEvidence {
  status: "passed" | "failed";
  scanner: "gitleaks";
  checked_at: string;
  finding_count: number;
  rule_ids?: string[];
  report_ref?: string;
}

export interface SbomVulnerabilityEvidence {
  status: "passed" | "failed";
  scanner: "syft+grype";
  checked_at: string;
  sbom_ref?: string;
  vulnerability_count?: number;
  severity_counts?: Record<string, number>;
}

export interface DependencyScanEvidence {
  status: "passed" | "failed" | "skipped";
  checked_at: string;
  report_ref?: string;
  summary?: string;
}

export interface ChecklistEvidence {
  status: "passed" | "blocked" | "missing_evidence";
  checked_at?: string;
  completed_items?: number;
  total_items?: number;
  checklist_ref?: string;
}

export interface AssembleSecurityEvidenceBundleOptions {
  profile?: ReleaseGateProfile;
  evidenceDir: string;
  generatedAt?: string;
}

export const SECURITY_CHECK_CONTROL_IDS = [
  "supply_chain.verify",
  "supply_chain.dependency_scan",
  "supply_chain.secret_scan",
  "supply_chain.sbom_vulnerability",
  "auth.asvs_checklist",
  "auth.api_top10_checklist",
] as const;

export const SMALL_GROUP_BACKUP_RESTORE_CONTROL_IDS = [
  "backup_restore.export_fresh",
  "backup_restore.drill",
] as const;

export type SecurityCheckControlId = (typeof SECURITY_CHECK_CONTROL_IDS)[number];
