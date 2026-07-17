/** Instance-scoped tables exported once under `app.service` before per-org snapshots. */
export const BACKUP_INSTANCE_EXPORT_TABLES = [
  "instances",
  "instance_configurations",
  "instance_identity_configurations",
  "bootstrap_operator_claims",
  "instance_operators",
  "bootstrap_secret_verifiers",
  "user_admissions",
  "provider_app_registrations",
  "agent_sessions",
  "revoked_cli_sessions",
] as const;

/** Tenant-owned tables exported inside each organization snapshot transaction. */
export const BACKUP_ORGANIZATION_EXPORT_TABLES = [
  "organizations",
  "projects",
  "environments",
  "teams",
  "memberships",
  "organization_data_keys",
  "project_data_keys",
  "invitations",
  "sync_target_leases",
  "machine_identities",
  "machine_identity_memberships",
  "machine_identity_github_actions_oidc",
  "machine_identity_environment_deploy_keys",
  "app_connections",
  "provider_credentials",
  "sensitive_metadata_fields",
  "secrets",
  "secret_versions",
  "runtime_injection_policies",
  "runtime_injection_policy_versions",
  "injection_grants",
  "audit_events",
  "operations",
  "webhook_subscriptions",
  "webhook_subscription_event_types",
  "webhook_signing_secrets",
  "in_app_event_notifications",
  "secret_syncs",
  "secret_sync_bindings",
  "first_value_feedback",
  "approval_requests",
  "promotion_change_set_draft_versions",
  "protected_changes",
  "protected_change_approval_evidence",
  "delivery_risk_policies",
  "preview_automation_opt_ins",
] as const;

/**
 * Schema tables intentionally omitted from disaster-recovery exports. Every omission needs review.
 *
 * - `restore_import_journal` (ADR-0084) is restore-target-local state: the fresh-target proof
 *   requires it present-but-empty, and its singleton row is the once-ever import marker for that
 *   specific target. Exporting it would round-trip a stale marker into the next restore.
 */
export const BACKUP_EXPORT_EXCLUDED_TABLES = ["restore_import_journal"] as const;

type BackupInstanceExportTable = (typeof BACKUP_INSTANCE_EXPORT_TABLES)[number];
type BackupOrganizationExportTable = (typeof BACKUP_ORGANIZATION_EXPORT_TABLES)[number];
export type BackupExportTable = BackupInstanceExportTable | BackupOrganizationExportTable;

const EXPORT_TABLE_SET = new Set<string>([
  ...BACKUP_INSTANCE_EXPORT_TABLES,
  ...BACKUP_ORGANIZATION_EXPORT_TABLES,
]);

export function assertBackupExportTableName(tableName: string): BackupExportTable {
  if (!EXPORT_TABLE_SET.has(tableName)) {
    throw new Error(`unsupported backup export table: ${tableName}`);
  }
  return tableName as BackupExportTable;
}

export function collectBackupExportCoverageViolations(
  schemaTableNames: readonly string[],
  exportedTableNames: readonly string[] = [...EXPORT_TABLE_SET],
  excludedTableNames: readonly string[] = BACKUP_EXPORT_EXCLUDED_TABLES,
): string[] {
  const schema = new Set(schemaTableNames);
  const exported = new Set(exportedTableNames);
  const excluded = new Set(excludedTableNames);
  const violations: string[] = [];

  for (const tableName of exported) {
    if (!schema.has(tableName)) {
      violations.push(`exported table ${tableName} is not present in the schema registry`);
    }
    if (excluded.has(tableName)) {
      violations.push(`table ${tableName} is both exported and explicitly excluded`);
    }
  }

  for (const tableName of excluded) {
    if (!schema.has(tableName)) {
      violations.push(`excluded table ${tableName} is not present in the schema registry`);
    }
  }

  for (const tableName of schema) {
    if (!exported.has(tableName) && !excluded.has(tableName)) {
      violations.push(`schema table ${tableName} is neither exported nor explicitly excluded`);
    }
  }

  return violations.sort();
}
