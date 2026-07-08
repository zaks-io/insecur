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
  "first_value_feedback",
] as const;

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
