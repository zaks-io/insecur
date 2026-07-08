/**
 * Secret Sync and exact binding tables (INS-76).
 */
/* Stryker disable ObjectLiteral */
import { boolean, check, foreignKey, pgTable, sql, text, timestamp, unique } from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";
import { appConnections } from "./tenant-integrations.js";
import { orgProjectAndEnvironmentForeignKeys } from "./tenant-org-scope-foreign-keys.js";
import { secrets } from "./tenant-secrets.js";

export const SECRET_SYNC_STATUSES = ["active", "disabled", "deleted"] as const;

export const SECRET_SYNC_KINDS_DB = ["github-actions", "cloudflare-worker-secret"] as const;

export const SECRET_SYNC_MAPPING_BEHAVIORS_DB = ["managed", "merge"] as const;

export const GITHUB_ACTIONS_PROVIDER_SCOPES_DB = ["environment", "repository"] as const;

export const secretSyncs = pgTable(
  "secret_syncs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id").notNull(),
    appConnectionId: text("app_connection_id").notNull(),
    displayName: text("display_name").notNull(),
    kind: text("kind").notNull(),
    mappingBehavior: text("mapping_behavior").notNull().default("managed"),
    autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(false),
    status: text("status").notNull().default("active"),
    githubProviderScope: text("github_provider_scope"),
    targetRepoId: text("target_repo_id"),
    targetGithubEnvironmentId: text("target_github_environment_id"),
    createdByUserId: text("created_by_user_id").notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("secret_syncs_org_id_id_key").on(table.orgId, table.id),
    unique("secret_syncs_environment_id_display_name_key").on(
      table.environmentId,
      table.displayName,
    ),
    ...orgProjectAndEnvironmentForeignKeys("secret_syncs", table),
    foreignKey({
      name: "secret_syncs_org_app_connection_fkey",
      columns: [table.orgId, table.appConnectionId],
      foreignColumns: [appConnections.orgId, appConnections.id],
    }),
    check(
      "secret_syncs_kind_check",
      sql`${table.kind} IN ('github-actions', 'cloudflare-worker-secret')`,
    ),
    check(
      "secret_syncs_mapping_behavior_check",
      sql`${table.mappingBehavior} IN ('managed', 'merge')`,
    ),
    check("secret_syncs_status_check", sql`${table.status} IN ('active', 'disabled', 'deleted')`),
    check(
      "secret_syncs_github_provider_scope_check",
      sql`${table.githubProviderScope} IS NULL OR ${table.githubProviderScope} IN ('environment', 'repository')`,
    ),
    check(
      "secret_syncs_github_actions_target_check",
      sql`${table.kind} <> 'github-actions' OR (${table.targetRepoId} IS NOT NULL AND ${table.githubProviderScope} IS NOT NULL AND (${table.githubProviderScope} = 'repository' OR ${table.targetGithubEnvironmentId} IS NOT NULL))`,
    ),
    check(
      "secret_syncs_cloudflare_target_check",
      sql`${table.kind} <> 'cloudflare-worker-secret' OR ${table.targetRepoId} IS NULL`,
    ),
  ],
);

export const secretSyncBindings = pgTable(
  "secret_sync_bindings",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    secretSyncId: text("secret_sync_id").notNull(),
    secretId: text("secret_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("secret_sync_bindings_org_id_id_key").on(table.orgId, table.id),
    unique("secret_sync_bindings_sync_secret_key").on(table.secretSyncId, table.secretId),
    foreignKey({
      name: "secret_sync_bindings_org_sync_fkey",
      columns: [table.orgId, table.secretSyncId],
      foreignColumns: [secretSyncs.orgId, secretSyncs.id],
    }),
    foreignKey({
      name: "secret_sync_bindings_org_secret_fkey",
      columns: [table.orgId, table.secretId],
      foreignColumns: [secrets.orgId, secrets.id],
    }),
  ],
);
