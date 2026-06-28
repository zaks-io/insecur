/**
 * Drizzle schema source of truth (ADR-0037). Plain table definitions only.
 */
/* Stryker disable ObjectLiteral */
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { primaryKey } from "drizzle-orm/pg-core";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "./pg-core.js";
import { organizations, projects, teams } from "./tenant-hierarchy.js";
import { orgEnvironmentForeignKey, orgProjectForeignKey } from "./tenant-org-scope-foreign-keys.js";
import { operations } from "./tenant-secrets.js";
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    teamId: text("team_id").notNull(),
    inviteeUserId: text("invitee_user_id").notNull(),
    rolePreset: text("role_preset").notNull(),
    projectId: text("project_id"),
    status: text("status").notNull().default("pending"),
    membershipId: text("membership_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "invitations_org_team_fkey",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }),
    foreignKey({
      name: "invitations_org_project_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    check("invitations_status_check", sql`${table.status} IN ('pending', 'accepted', 'revoked')`),
    check(
      "invitations_role_preset_check",
      sql`${table.rolePreset} IN ('owner', 'admin', 'developer', 'metadata-viewer', 'approval', 'read-only')`,
    ),
    uniqueIndex("invitations_one_pending_per_invitee_org_project")
      .on(table.orgId, table.inviteeUserId, table.projectId)
      .where(sql`${table.status} = 'pending'`)
      .nullsNotDistinct(),
  ],
);

export const syncTargetLeases = pgTable(
  "sync_target_leases",
  {
    orgId: text("org_id").notNull(),
    projectId: text("project_id").notNull(),
    providerKind: text("provider_kind").notNull(),
    targetIdentity: text("target_identity").notNull(),
    heldByOperationId: text("held_by_operation_id")
      .notNull()
      .references(() => operations.id),
    fencingToken: bigint("fencing_token", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.orgId, table.projectId, table.providerKind, table.targetIdentity],
    }),
    foreignKey({
      name: "sync_target_leases_org_id_project_id_fkey",
      columns: [table.orgId, table.projectId],
      foreignColumns: [projects.orgId, projects.id],
    }),
    check("sync_target_leases_fencing_token_positive", sql`${table.fencingToken} > 0`),
    index("sync_target_leases_held_by_operation_id_idx").on(table.orgId, table.heldByOperationId),
  ],
);

export const machineIdentities = pgTable(
  "machine_identities",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("machine_identities_org_id_id_key").on(table.orgId, table.id)],
);

function orgMachineIdentityAndProjectForeignKeys(table: {
  orgId: AnyPgColumn;
  machineIdentityId: AnyPgColumn;
  projectId: AnyPgColumn;
}) {
  return [
    foreignKey({
      columns: [table.orgId, table.machineIdentityId],
      foreignColumns: [machineIdentities.orgId, machineIdentities.id],
    }),
    orgProjectForeignKey(table),
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
    unique("machine_identity_memberships_org_id_machine_identity_id_project_id_key").on(
      table.orgId,
      table.machineIdentityId,
      table.projectId,
    ),
    ...orgMachineIdentityAndProjectForeignKeys(table),
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
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    machineIdentityId: text("machine_identity_id").notNull(),
    projectId: text("project_id").notNull(),
    environmentId: text("environment_id"),
    githubRepository: text("github_repository").notNull(),
    githubEnvironment: text("github_environment"),
    oidcAudience: text("oidc_audience").notNull(),
    credentialScopes: text("credential_scopes").array().notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("machine_identity_github_actions_oidc_org_id_id_key").on(table.orgId, table.id),
    ...orgMachineIdentityAndProjectForeignKeys(table),
    orgEnvironmentForeignKey(table),
    check(
      "machine_identity_github_actions_oidc_repository_lowercase",
      sql`lower(${table.githubRepository}) = ${table.githubRepository}`,
    ),
    check(
      "machine_identity_github_actions_oidc_scopes_nonempty",
      sql`cardinality(${table.credentialScopes}) > 0`,
    ),
    check(
      "machine_identity_github_actions_oidc_status",
      sql`${table.status} IN ('active', 'disabled')`,
    ),
  ],
);
