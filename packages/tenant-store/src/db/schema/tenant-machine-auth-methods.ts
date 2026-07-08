/**
 * Machine identity auth method tables (memberships, GitHub Actions OIDC, deploy keys).
 */
/* Stryker disable ObjectLiteral */
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
} from "./pg-core.js";
import {
  orgEnvironmentFkey,
  orgMachineIdentityFkey,
  orgProjectFkey,
} from "./pg-identifier-names.js";
import { environments, organizations, projects } from "./tenant-hierarchy.js";
import { orgScopedNamedResourceBaseColumns } from "./tenant-org-scoped-named-resource.js";

export const machineIdentities = pgTable(
  "machine_identities",
  {
    ...orgScopedNamedResourceBaseColumns(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("machine_identities_org_id_id_key").on(table.orgId, table.id)],
);

function orgMachineIdentityAndProjectForeignKeys(
  tableName: string,
  table: {
    orgId: AnyPgColumn;
    machineIdentityId: AnyPgColumn;
    projectId: AnyPgColumn;
  },
) {
  return [
    foreignKey({
      name: orgMachineIdentityFkey(tableName),
      columns: [table.orgId, table.machineIdentityId],
      foreignColumns: [machineIdentities.orgId, machineIdentities.id],
    }),
    foreignKey({
      name: orgProjectFkey(tableName),
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
  ];
}

function machineAuthMethodScopeColumns() {
  return {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    machineIdentityId: text("machine_identity_id").notNull(),
    projectId: text("project_id").notNull(),
  };
}

function machineAuthMethodStatusChecks(
  tableName: string,
  credentialScopesColumn: AnyPgColumn,
  statusColumn: AnyPgColumn,
) {
  return [
    check(`${tableName}_scopes_nonempty`, sql`cardinality(${credentialScopesColumn}) > 0`),
    check(`${tableName}_status`, sql`${statusColumn} IN ('active', 'disabled')`),
  ];
}

export const machineIdentityMemberships = pgTable(
  "machine_identity_memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    machineIdentityId: text("machine_identity_id").notNull(),
    projectId: text("project_id").notNull(),
    authorizationScopes: text("authorization_scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("machine_identity_memberships_org_id_id_key").on(table.orgId, table.id),
    unique("mi_memberships_org_machine_project_key").on(
      table.orgId,
      table.machineIdentityId,
      table.projectId,
    ),
    ...orgMachineIdentityAndProjectForeignKeys("machine_identity_memberships", table),
    check("machine_identity_memberships_project_scoped", sql`${table.projectId} IS NOT NULL`),
    check(
      "machine_identity_memberships_scopes_nonempty",
      sql`cardinality(${table.authorizationScopes}) > 0`,
    ),
  ],
);

export const machineIdentityGitHubActionsOidc = pgTable(
  "machine_identity_github_actions_oidc",
  {
    ...machineAuthMethodScopeColumns(),
    environmentId: text("environment_id"),
    githubRepository: text("github_repository").notNull(),
    githubRepositoryId: text("github_repository_id").notNull(),
    githubRepositoryOwnerId: text("github_repository_owner_id").notNull(),
    githubEnvironment: text("github_environment"),
    oidcAudience: text("oidc_audience").notNull(),
    credentialScopes: text("credential_scopes").array().notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("machine_identity_github_actions_oidc_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: "mi_gha_oidc_org_fkey",
      columns: [table.orgId],
      foreignColumns: [organizations.id],
    }),
    ...orgMachineIdentityAndProjectForeignKeys("machine_identity_github_actions_oidc", table),
    foreignKey({
      name: orgEnvironmentFkey("machine_identity_github_actions_oidc"),
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
    check(
      "machine_identity_github_actions_oidc_repository_lowercase",
      sql`lower(${table.githubRepository}) = ${table.githubRepository}`,
    ),
    check(
      "machine_identity_github_actions_oidc_repository_id_numeric",
      sql`${table.githubRepositoryId} ~ '^[0-9]+$'`,
    ),
    check("mi_gha_oidc_owner_id_numeric", sql`${table.githubRepositoryOwnerId} ~ '^[0-9]+$'`),
    ...machineAuthMethodStatusChecks(
      "machine_identity_github_actions_oidc",
      table.credentialScopes,
      table.status,
    ),
  ],
);

export const machineIdentityEnvironmentDeployKeys = pgTable(
  "machine_identity_environment_deploy_keys",
  {
    ...machineAuthMethodScopeColumns(),
    environmentId: text("environment_id").notNull(),
    runtimePolicyKeyIds: text("runtime_policy_key_ids").array().notNull(),
    credentialScopes: text("credential_scopes").array().notNull(),
    secretHashAlgorithm: text("secret_hash_algorithm").notNull(),
    secretHashSaltB64: text("secret_hash_salt_b64").notNull(),
    secretHashB64: text("secret_hash_b64").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    nonExpiring: boolean("non_expiring").notNull().default(false),
    rotationIntervalSeconds: bigint("rotation_interval_seconds", { mode: "number" }),
    rotationReminderIntervalSeconds: bigint("rotation_reminder_interval_seconds", {
      mode: "number",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("machine_identity_environment_deploy_keys_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: "mi_env_deploy_keys_org_fkey",
      columns: [table.orgId],
      foreignColumns: [organizations.id],
    }),
    ...orgMachineIdentityAndProjectForeignKeys("machine_identity_environment_deploy_keys", table),
    foreignKey({
      name: orgEnvironmentFkey("machine_identity_environment_deploy_keys"),
      columns: [table.orgId, table.environmentId],
      foreignColumns: [environments.orgId, environments.id],
    }),
    check(
      "machine_identity_environment_deploy_keys_environment_required",
      sql`${table.environmentId} IS NOT NULL`,
    ),
    check(
      "machine_identity_environment_deploy_keys_policy_keys_nonempty",
      sql`cardinality(${table.runtimePolicyKeyIds}) > 0`,
    ),
    ...machineAuthMethodStatusChecks(
      "machine_identity_environment_deploy_keys",
      table.credentialScopes,
      table.status,
    ),
    check(
      "machine_identity_environment_deploy_keys_non_expiring_shape",
      sql`(${table.nonExpiring} = false) OR (${table.expiresAt} IS NULL)`,
    ),
    check(
      "machine_identity_environment_deploy_keys_expiring_shape",
      sql`(${table.nonExpiring} = true) OR (${table.expiresAt} IS NOT NULL)`,
    ),
    check(
      "mi_env_deploy_keys_rot_interval_chk",
      sql`${table.rotationIntervalSeconds} IS NULL OR ${table.rotationIntervalSeconds} > 0`,
    ),
    check(
      "mi_env_deploy_keys_rot_reminder_chk",
      sql`${table.rotationReminderIntervalSeconds} IS NULL OR ${table.rotationReminderIntervalSeconds} > 0`,
    ),
  ],
);
